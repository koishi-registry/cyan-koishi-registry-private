import { type Disposable, DisposableList, mapValues, omit } from '@kra/utils';
import type { Context } from '@p/core';
import type { Awaitable, Dict, Promisify } from 'cosmokit';
import type { Manifest } from './manifest.ts';
import type { Client } from './mod.ts';

// biome-ignore lint/suspicious/noExplicitAny: any by default
export class Entry<T = any> {
  public id: string;
  public temporal = false;

  taskDefs: Partial<Entry.TaskDef> = Object.create(null);
  tasks: Partial<Entry.TaskInfo> = Object.create(null);
  disposables: DisposableList<Disposable> = new DisposableList();

  constructor(
    public ctx: Context,
    public files: Entry.Info,
    data?: Entry.TaskDef['data'],
  ) {
    this.id = ctx.loader.locate(ctx) || ctx.name;
    if (!this.id) {
      this.temporal = true;
      this.id = Math.random().toString(36).slice(2);
    }
    ctx.krat.entries[this.id] = this;
    this.taskDefs['data'] = data;
  }

  defTask<K extends keyof Entry.TaskDef>(name: K, fn: Entry.TaskDef[K]) {
    this.taskDefs[name] = fn;
  }

  async execute<K extends keyof Entry.TaskDef>(
    name: K,
    ...args: Parameters<Entry.TaskDef[K]>
  ) {
    const promise = Promise.try(() =>
      this.taskDefs?.[name]?.call(this, ...args),
    );
    this.tasks[name] = { promise, state: 'Pending' };
    promise
      .then(() => (this.tasks[name]!.state = 'Complete'))
      .catch(() => (this.tasks[name]!.state = 'Error'));
    return promise as Promise<Awaited<ReturnType<Entry.TaskDef[K]>>>;
  }

  async executeFallible<R, K extends keyof Entry.TaskDef>(
    name: K,
    fallback: (
      ...args: Parameters<Entry.TaskDef[K]>
    ) => R | ReturnType<Entry.TaskDef[K]>,
    ...args: Parameters<Entry.TaskDef[K]>
  ) {
    const promise = Promise.try(() =>
      (this.taskDefs?.[name] || fallback)?.call(this, ...args),
    );
    this.tasks[name] = { promise, state: 'Pending' };
    promise
      .then(() => (this.tasks[name]!.state = 'Complete'))
      .catch(() => (this.tasks[name]!.state = 'Error'));
    return promise as Promise<Awaited<ReturnType<Entry.TaskDef[K]> | R>>;
  }

  async executeOnce<K extends keyof Entry.TaskDef>(
    name: K,
    ...args: Parameters<Entry.TaskDef[K]>
  ) {
    if (this.tasks[name]) return this.tasks[name].promise;
    const promise = Promise.try(() =>
      this.taskDefs?.[name]?.call(this, ...args),
    );
    this.tasks[name] = { promise, state: 'Pending' };
    promise
      .then(() => (this.tasks[name]!.state = 'Complete'))
      .catch(() => (this.tasks[name]!.state = 'Error'));
    return promise as Promise<Awaited<ReturnType<Entry.TaskDef[K]>>>;
  }

  async executeOnceFallible<R, K extends keyof Entry.TaskDef>(
    name: K,
    fallback: (
      ...args: Parameters<Entry.TaskDef[K]>
    ) => R | ReturnType<Entry.TaskDef[K]>,
    ...args: Parameters<Entry.TaskDef[K]>
  ) {
    if (this.tasks[name]) return this.tasks[name].promise;
    const promise = Promise.try(() =>
      (this.taskDefs?.[name] || fallback)?.call(this, ...args),
    );
    this.tasks[name] = { promise, state: 'Pending' };
    promise
      .then(() => (this.tasks[name]!.state = 'Complete'))
      .catch(() => (this.tasks[name]!.state = 'Error'));
    return promise as Promise<Awaited<ReturnType<Entry.TaskDef[K]> | R>>;
  }

  async init() {
    const dispose = this.ctx.effect(() => {
      const ctx = this.ctx;

      ctx.krat.broadcast(
        'entry:init',
        async (client: Client) =>
          ({
            serverId: ctx.krat.id,
            clientId: client.id,
            entries: {
              [this.id]: (await this.toJSON(client))!,
            },
          }) satisfies Entry.Init,
      );

      return () => {
        delete this.ctx.krat.entries[this.id];
        return ctx.krat.broadcast(
          'entry:init',
          (client: Client) =>
            ({
              serverId: ctx.krat.id,
              clientId: client.id,
              entries: {
                // biome-ignore lint/suspicious/noExplicitAny: for init
                [this.id]: null as any,
              },
            }) satisfies Entry.Init,
        );
      };
    });
    this.disposables.push(dispose);
  }

  public async dispose() {
    await Promise.all(
      this.disposables.clear().map(async (disposable) => await disposable()),
    );
  }

  async refresh() {
    return await this.ctx.krat.broadcast(
      'entry:update',
      async (client: Client) => ({
        id: this.id,
        data: await this.execute('data', client),
      }),
    );
  }

  patch<T>(data: T, key?: string) {
    return this.ctx.krat.broadcast('entry:patch', {
      id: this.id,
      data,
      key,
    });
  }

  async toJSON(client: Client): Promise<Entry.Data<T> | undefined> {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: make ts happy
      const tasks = mapValues(<any>(<Entry.TaskInfo>this.tasks), (value) =>
        omit(value as any, ['promise']),
      );
      return {
        files: await this.ctx.krat.resolveEntry(this),
        entryId: this.ctx.get('loader')?.locate(),
        data: structuredClone(await this.executeOnce('data', client)) as T || undefined,
        tasks,
      };
    } catch (e) {
      this.ctx.logger.warn(e);
    }
  }
}

export namespace Entry {
  export interface TaskDef {
    data(this: Entry, client: Client): Awaitable<unknown>;
    compile(this: Entry): Promise<Manifest>;
  }

  export const TaskState = {
    Pending: 'Pending',
    Complete: 'Complete',
    Error: 'Error',
  };
  export type TaskState = (typeof TaskState)[keyof typeof TaskState];

  // biome-ignore lint/complexity/noBannedTypes: shorthand
  export type TaskInfo = TaskDef[keyof TaskDef] extends Function
    ? {
        [key in keyof TaskDef]: {
          promise?: Promisify<ReturnType<TaskDef[key]>>;
          state: TaskState;
        };
      }
    : never;

  export interface Info {
    base?: string | URL;
    entry: string;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic default
  export interface Data<T = any> {
    files: string[];
    tasks: Partial<TaskInfo>;
    entryId?: string;
    data?: T;
  }

  export interface Init<T = unknown> {
    entries: Dict<Entry.Data<T>>;
    serverId: string;
    clientId: number;
  }

  export interface Update<T = unknown> extends Data<T> {
    id: string;
  }

  export interface Patch<T = unknown> extends Data<T> {
    id: string;
    key?: string;
  }
}
