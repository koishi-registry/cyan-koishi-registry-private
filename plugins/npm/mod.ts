import type { HTTP } from '@cordisjs/plugin-http';
import { Schema } from '@cordisjs/plugin-schema';
import { NpmWatcher as preload } from '@km-api/km-api/preload';
import { type Context, Service, symbols } from '@p/core';
import {
  SQLiteColumn,
  type SQLiteTableWithColumns,
  integer,
  sqliteTable,
  text,
} from '@plug/indexing/declare';
import type Idx from '@plug/indexing/idx';
import type { ScheduleState } from '@plug/scheduler';
import { delay } from '@std/async';
import { parse, parseRange, satisfies } from '@std/semver';
import type { Awaitable, Dict } from 'cosmokit';
import { defineProperty, noop } from 'cosmokit';
import { eq } from 'drizzle-orm/sql';
import trimEnd from 'lodash.trimend';
import { type Range, chunksIter, take } from './helper';
import { type ParserOptions, parseStream } from './parse';

declare module '@p/core' {
  export interface Context {
    npm: NpmSync;
  }

  export interface Events {
    'npm/changes'(changes: ChangeRecord[]): Awaitable<void>;
    'npm/synchronized'(): Awaitable<void>;
  }
}

export interface Change {
  rev: string;
}

export interface ChangeRecord {
  seq: number;
  id: string;
  changes: Change[];
  deleted?: boolean;
}

export interface Block {
  id: number;
  begin: number;
  end: number;
}

export type BlockTask = Block & { done: boolean };

export interface ReplicateInfo {
  db_name: string;
  engine: string;
  doc_count: number;
  doc_del_count: number;
  update_seq: number;
  purge_seq: number;
  compact_running: boolean;
  sizes: {
    active: number;
    external: number;
    file: number;
  };
  disk_size: number;
  data_size: number;
  other: { data_size: number };
  instance_start_time: string;
  disk_format_version: number;
  committed_update_seq: number;
  compacted_seq: number;
  uuid: string;
}

const historyColumns = {
  seq: integer('seq').primaryKey(),
  name: text('name').notNull(),
  deleted: integer({ mode: 'boolean' }).default(false),
  changes: text({ mode: 'json' }).default([]),
} as const;

const prepareColumns = {
  id: integer('block_id').primaryKey(),
  begin: integer().notNull(),
  end: integer().notNull(),
  progress: integer().default(0).notNull(),
  done: integer({ mode: 'boolean' }).default(false),
} as const;

export class NpmSync extends Service {
  static inject = ['http', 'indexing', 'scheduler'];

  _prepareTask: Promise<void>;

  http: HTTP;
  history: Idx.From<typeof historyColumns>;
  prepare: Idx.From<typeof prepareColumns>;
  concurrent: ScheduleState;
  nextQuery: ScheduleState;

  state = 0;

  constructor(
    ctx: Context,
    public options: NpmSync.Config,
  ) {
    super(ctx, 'npm');
    this.options.endpoint = trimEnd(this.options.endpoint, '/');

    this.history = ctx.indexing.section(
      sqliteTable(`${this.options.section}$history`, historyColumns),
    );
    this.prepare = ctx.indexing.section(
      sqliteTable(`${this.options.section}$prepare`, prepareColumns),
    );

    this.http = ctx.http.extend({
      baseURL: this.options.endpoint,
      timeout: this.options.timeout,
    });

    // ctx.on(
    //   'npm/changes',
    //   (changes) => {
    //     ctx.logger.info('updated count: ', changes.length);
    //   },
    // );

    this.concurrent = this.ctx.scheduler({
      cap: this.options.concurrent,
      mode: 'work-steal',
    });
    this.nextQuery = this.ctx.scheduler({
      id: this.options.endpoint,
      cap: 100,
    });
  }

  async changes(
    since: number,
    interval: number|undefined = undefined,
    options?: ParserOptions,
  ) {
    const res = await this.http<ReadableStream<Uint8Array>>('/_changes', {
      method: 'POST',
      headers: {
        'Last-Event-ID': since,
      },
      params: {
        since: since,
        seq_interval: interval,
      },
      responseType: (r) => r.body,
    });

    return parseStream(
      res.data,
      options || {},
    );
  }

  protected async statistics() {
    return await this.http.get<ReplicateInfo>('/');
  }

  protected async catchUp(target: number) {
    this.ctx.logger.info('catchUp $', { target });
    const abort = new AbortController();
    // let seq = this.state
    const dispose = this.ctx.effect(() => () => abort.abort())
    const persist = this.prepare;

    const [count, iter] = chunksIter(
      [this.state, target],
      this.options.block_size,
    );
    const progress = Array.from({ length: count }, () => false);
    this.ctx.logger.info('catchUp $ chunk', { count });

    const print = () => {
      const sz = Math.floor((process.stdout.columns || 50) / 2);
      const x = count / sz;
      const iter = progress[Symbol.iterator]();

      let counter = 0;
      let perce = 0;
      let part = take(iter, x);
      while (part.length) {
        // sum up all elements in part
        const val = part.reduce((acc, cur) => acc + Number(cur), 0);
        const percent = val / x;
        if (percent >= 0.99) process.stdout.write('🟩');
        else if (percent > 0.9) process.stdout.write('🟦');
        else if (percent > 0.5) process.stdout.write('🟨');
        else if (percent > 0.25) process.stdout.write('🟧');
        else process.stdout.write('🟥');
        part = take(iter, x);
        perce += percent;
        counter += 1;
      }
      process.stdout.write(`\n[${(perce / counter) * 100}%]\n`);
    };

    const block = async (id: number, chunk: Range) => {
      let seq = chunk[0];
      let retries = this.options.max_retries;
      while (seq <= chunk[1] && retries --> 0) {
        await this.nextQuery.period('tickHttp');
        const stream = await this.changes(seq, this.options.block_size, {
          signal: abort.signal,
          intercept: (value) => {
            seq = value;
            return value > chunk[1];
          },
        }).catch(noop);
        if (abort.signal.aborted) return;
        if (!stream) continue;
        for await (const changes of stream)
          await this.ctx.parallel('npm/changes', changes);
      }
      if (retries <= 0) throw new Error('retry limit exceed');

      progress[id] = true;
      this.ctx.logger.debug('worker', 'complete', id);
    };

    let chunks = take(iter, this.options.concurrent);

    let counter = 0;
    const spices: (() => Promise<void>)[]= [];
    const tasks: Promise<unknown>[]= [];

    const disposeTimer = noop || this.ctx.get('timer')?.setInterval?.(()=>print(), 300) || noop
    do {
      // this.ctx.logger.info('catchUp $ prepare tasks', {counter})
      for (const chunk of chunks) {
        const id = counter++;
        spices.push(() => block(id, chunk));
      }
      tasks.push(this.concurrent.all(spices));
      // console.log('state', this.concurrent)
      spices.length = 0;
      chunks = take(iter, this.options.concurrent);
      await Promise.resolve();
    } while (chunks.length);

    await Promise.all(tasks);
    this.state = target
    dispose();
    disposeTimer?.();
  }

  protected async fetcher() {
    const abort = new AbortController();
    this.ctx.effect(() => () => abort.abort());
    while (this.ctx.scope.active)
      await this.changes(this.state, this.options.block_size, {
        signal: abort.signal,
        intercept: (value) => {
          this.state = value;
          return false;
        },
      });
  }

  async [symbols.setup]() {
    const statistics = this.concurrent.withRetry(() => this.statistics());
    const info = await statistics();

    const prepare = (this._prepareTask = this.catchUp(
      info.committed_update_seq,
    ).then(() => this.ctx.emit('npm/synchronized')));

    await prepare.then(() => this.fetcher());
  }
}

export namespace NpmSync {
  export interface Config {
    endpoint: string;
    timeout: number;
    concurrent: number;
    block_size: number;
    max_retries: number;
    section: string;
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().default('http://localhost:8000'),
    timeout: Schema.number()
      .default(3000)
      .description('Connection Timeout (ms)'),
    concurrent: Schema.natural().min(1).default(30),
    block_size: Schema.natural().min(100).default(5000),
    max_retries: Schema.natural().min(0).default(10),
    section: Schema.string()
      .default('npm_sync')
      .description('indexing section prefix'),
  });
}

export default NpmSync;
