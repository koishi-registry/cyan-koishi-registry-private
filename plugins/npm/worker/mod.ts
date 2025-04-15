import { Service, symbols, type Context } from "@p/core";
import { Stage, type C2SPackages, type S2CPackages } from "./shared";
import IndexService, { type Idx } from "@plug/indexing";
import { NpmWatcher } from "@km-api/km-api/preload";

import type { ReplicateInfo, ChangeRecord, Range } from "../types";
import { sql } from "drizzle-orm";
import { type } from "@kra/meta";
import { chunksIter, take } from "./helper";
import type NpmSync from "../mod";
import type HTTP from "@cordisjs/plugin-http";
import type { CommunicationService } from "@p/communicate";
import WorkerService from "@plug/worker";
import type { Block, Writer } from "../writer/shared";
import { Scheduler, type ScheduleState } from "cordis-plugin-scheduler";
import { parseStream, type ParserOptions } from "./parse";
import { noop } from "cosmokit";

export const inject = ["timer", "http"];

export const name = "npm-sync$writer";

export const Config = type({
  file: "string",
  section: "string",
}).assert;

export function generateBlocks(target: number, block_size: number) {
  const [count, iter] = chunksIter([this.state, target], block_size);
  return [count, iter];
}

export class NpmSync$worker extends Service {
  http: HTTP;
  c: CommunicationService<{ Remote: S2CPackages; Local: C2SPackages }>;
  writer: Writer;

  concurrent: ScheduleState;
  nextQuery: ScheduleState;

  _prepareTask: Promise<void>;

  state = 0;

  static inject = ["worker", "indexing", "scheduler"];

  get epId() {
    const url = new URL(this.options.endpoint);
    return url.host;
  }

  constructor(
    ctx: Context,
    public readonly options: NpmSync.Config,
  ) {
    super(ctx, "npm_sync$worker");
    ctx.alias("npm_sync$worker", ["npm"]);

    this.c = ctx.$communicate.cast();
    this.c.post("status", {
      stage: Stage.Pending,
    });

    ctx.on("npm/synchronized", () => {
      this.c.post("synchronized", {});
    });

    this.http = ctx.http.extend({
      baseURL: this.options.endpoint,
      timeout: this.options.timeout,
    });

    const { promise: childPromise, resolve: resolveChild } =
      Promise.withResolvers<Writer>();

    this.writer = ctx.worker
      .spawn(import.meta.resolve("../writer/mod.ts"), {
        file: this.options.file,
        prefix: `npm_sync$${this.epId}`,
      })
      .cast();

    this.concurrent = this.ctx.scheduler({
      cap: this.options.concurrent,
      mode: "work-steal",
    });
    this.nextQuery = this.ctx.scheduler({
      id: this.options.endpoint,
      mode: "work-steal",
      cap: 100,
    });
  }

  stage(stage: Stage) {
    this.c.post("status", {
      stage,
    });
  }

  async [symbols.setup]() {
    const writer = this.writer;
    const c = this.c;

    await writer.ready;
    this.stage(Stage.Prefetch);
    const statistics = this.concurrent.withRetry(() => this.statistics());
    const info = await statistics();
    c.post("statistics", info);

    const prepare = (this._prepareTask = this.catchUp(info.update_seq).then(
      () => this.ctx.emit("npm/synchronized"),
    ));

    await prepare.then(() => {
      this.stage(Stage.Fetching);
      return this.fetcher();
    });
  }

  async changes(since: number, limit?: number, options?: ParserOptions) {
    const res = await this.http<ReadableStream<Uint8Array>>("/_changes", {
      method: "POST",
      headers: {
        "Last-Event-ID": since,
        "npm-replication-Opt-In": true,
      },
      params: {
        since,
        limit,
      },
      responseType: (r) => r.body,
    });

    return parseStream(res.data, options || {});
  }

  async getBlocks(target: number) {
    const blocks = await this.writer.chan.call("blocks/get");

    const count = Math.ceil(target / this.options.block_size);

    if (count > blocks.length) {
      const begin = blocks[blocks.length - 1]?.chunk?.[1] || this.state;
      const [_, iter] = chunksIter([begin, target], this.options.block_size);
      blocks.push(
        ...iter.map(
          (chunk, idx) =>
            ({
              id: blocks.length + idx,
              chunk,
              seq: chunk[0],
              done: false,
            }) satisfies Block,
        ),
      );

      await this.writer.chan.call("blocks/set", blocks)
    }

    return blocks;
  }

  protected async catchUp(target: number) {
    this.ctx.logger.info("catchUp $", { target });
    this.stage(Stage.CatchUp);

    const abort = new AbortController();
    // let seq = this.state
    const dispose = this.ctx.effect(() => () => abort.abort());

    const blocks = await this.getBlocks(target);
    const [count, iter] = [blocks.length, blocks[Symbol.iterator]()];

    const progress = Array.from({ length: count }, (_, idx) => blocks[idx].done);

    const catchUp = blocks
      .reduce((prev, cur) => cur.chunk[1] < target ? prev && cur.done : prev, true)
    if (!catchUp) this.stage(Stage.Fetching)

    this.ctx.logger.info("catchUp $ chunk", { count });

    const print = () => {
      const sz = Math.floor((process.stdout.columns || 50) / 2);
      const x = count / sz;
      const iter = progress[Symbol.iterator]();

      let num = 0.0;
      let part = take(iter, x);
      while (part.length) {
        // count the completed block
        const val = part.flatMap((x) => x || []).length;
        const percent = val / x;
        if (percent >= 0.999) process.stdout.write("🟩");
        else if (percent >= 0.9) process.stdout.write("🟪");
        else if (percent > 0.8) process.stdout.write("🟦");
        else if (percent > 0.5) process.stdout.write("🟨");
        else if (percent > 0.25) process.stdout.write("🟧");
        else process.stdout.write("🟥");
        part = take(iter, x);
        num += val;
      }
      process.stdout.write(`\n[${(num / count) * 100}%]\n`);
    };

    const block = async (id: number, seq: number, chunk: Range) => {
      const update = this.ctx.timer.throttle(() => {
        this.writer.chan.post("progress", {
          id,
          chunk,
          seq,
        });
      }, 1000);

      update();

      let retries = this.options.max_retries;
      while (seq < chunk[1] && retries --> 0) {
        await this.nextQuery.period("tickHttp");
        const limit = chunk[1] - seq;
        const stream = await this.changes(seq, limit, {
          signal: abort.signal,
          intercept: (value) => {
            seq = value;
            return (seq > (chunk[1] - 1));
          },
        }).catch(() => null);
        abort.signal.throwIfAborted();
        if (!stream) continue;
        for await (const changes of stream) {
          update();
          this.ctx
            .parallel("npm/changes", changes)
            .finally(() => this.writer.chan.post("records", changes));
        }
      }
      if (retries <= 0) throw new Error("retry limit exceed");

      this.writer.chan.post("progress", {
        id,
        chunk,
        seq,
      });

      progress[id] = true;

      this.ctx.logger.debug("worker", "complete", id);
    };

    let chunks = take(iter, this.options.concurrent);

    const spices: (() => Promise<void>)[] = [];
    const tasks: Promise<unknown>[] = [];

    // const disposeTimer = noop
    const disposeTimer = this.options.print_progress ? this.ctx.timer.setInterval(() => print(), 300) || noop : noop;
    do {
      // this.ctx.logger.info('catchUp $ prepare tasks', {counter})
      for (const { id, chunk, seq, done } of chunks) {
        if (done) continue;
        spices.push(() => block(id, seq, chunk));
      }
      tasks.push(this.concurrent.all(spices));
      // console.log('state', this.concurrent)
      spices.length = 0;
      chunks = take(iter, this.options.concurrent);
      await Promise.resolve();
    } while (chunks.length);

    await Promise.all(tasks);
    this.state = target;
    dispose();
    if (disposeTimer !== noop) print();
    disposeTimer?.();
  }

  protected async fetcher() {
    const abort = new AbortController();
    this.ctx.effect(() => () => abort.abort());

    while (this.ctx.scope.active) {
      const block = await this.writer.chan.call("blocks/new", {
        state: this.state, blockSize: this.options.block_size
      });

      const update = this.ctx.timer.throttle(() => {
        this.writer.chan.post("progress", {
          id: block.id,
          chunk: block.chunk,
          seq: block.seq,
        });
      }, 300);

      const stream = await this.changes(block.seq, block.chunk[1] - block.chunk[0], {
        signal: abort.signal,
        intercept: (value) => {
          this.state = value;
          block.seq = value;
          update()
          return false;
        },
      });
      for await (const changes of stream) {
        await this.ctx
          .parallel("npm/changes", changes)
          .finally(() => this.writer.chan.post("records", changes));
      }
    }
  }

  async statistics() {
    return await this.http.get<ReplicateInfo>("/");
  }
}

export async function apply(ctx: Context, options: NpmSync.Config) {
  ctx.plugin(WorkerService);
  ctx.plugin(IndexService, {
    file: options.file,
  });
  ctx.plugin(Scheduler);
  await ctx.plugin(NpmSync$worker, options);
}
