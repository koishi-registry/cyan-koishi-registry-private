import type { HTTP } from '@cordisjs/plugin-http';
import { Schema } from '@cordisjs/plugin-schema';
import { NpmWatcher as preload } from '@km-api/km-api/preload';
import { type Context, Service, symbols } from '@p/core';
import { desc } from '@plug/indexing/declare'
import type Idx from '@plug/indexing/idx';
import type { ScheduleState } from '@plug/scheduler';
import { delay } from '@std/async';
import { parse, parseRange, satisfies } from '@std/semver';
import type { Awaitable, Dict } from 'cosmokit';
import { defineProperty, noop } from 'cosmokit';
import trimEnd from 'lodash.trimend';
import { chunksIter, take } from './worker/helper';
import { type ParserOptions, parseStream } from './worker/parse';
import { Stage, type Worker } from './worker/shared';
import type { ReplicateInfo } from './types';

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

export class NpmSync extends Service {
  static inject = ['http', 'indexing', 'scheduler', 'worker', 'timer'];

  _prepareTask: Promise<void>;

  http: HTTP;
  concurrent: ScheduleState;
  nextQuery: ScheduleState;

  worker: Worker

  state = 0;

  stage: Stage

  constructor(
    ctx: Context,
    public options: NpmSync.Config,
  ) {
    super(ctx, 'npm');
    this.options.endpoint = trimEnd(this.options.endpoint, '/');

    this.http = ctx.http.extend({
      baseURL: this.options.endpoint,
      timeout: this.options.timeout,
    });

    this.worker = ctx.worker
      .spawn(import.meta.resolve('./worker/mod.ts'), options)
      .cast()

    ctx.on('npm/synchronized', () => ctx.logger.success("npm is synchronized"))
  }

  protected async statistics() {
    return await this.http.get<ReplicateInfo>('/');
  }

  async [symbols.setup]() {
    this.worker.chan.receive('status', ({ stage }) => {
      this.stage = stage
      if (stage === Stage.Fetching) this.ctx.emit('npm/synchronized')
    })
    await this.worker.ready
  }
}

export namespace NpmSync {
  export interface Config {
    endpoint: string;
    timeout: number;
    concurrent: number;
    block_size: number;
    max_retries: number;
    file: string;
    section: string;
    print_progress: boolean;
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().default('http://localhost:8000'),
    timeout: Schema.number()
      .default(3000)
      .description('connection timeout (ms)'),
    concurrent: Schema.natural().min(1).default(30),
    block_size: Schema.natural().min(100).default(5000).max(10000),
    max_retries: Schema.natural().min(0).default(10),
    file: Schema.string()
      .default("data/npm.db")
      .description("synchronize database path"),
    section: Schema.string()
      .default('npm_sync')
      .description('indexing section prefix'),
    print_progress: Schema.boolean()
      .default(false)
      .description("Print progress to console")
  });
}

export default NpmSync;
