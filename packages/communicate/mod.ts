import type { Context } from '@p/core';
import { Service } from 'cordis';
import Schema from 'schemastery';
import Random from 'inaba';
import { noop, remove } from 'cosmokit';
import type { Awaitable, Dict, Promisify } from 'cosmokit';
import type Communicator from './communicator/base.ts';
import * as cp from 'node:child_process';
import process from 'node:process';
import { InWorkerCommunicator } from './communicator/in_worker.ts';
import { ChildProcessCommunicator } from './communicator/child_process.ts';
import { ProcessCommunicator } from './communicator/process.ts';
import { NoopCommunicator } from './communicator/noop.ts';
import { WorkerCommunicator } from './communicator/worker.ts';
import { pathToFileURL, fileURLToPath } from 'bun';
import BunIPCCommunicator from './communicator/bun_ipc.ts';

export const kProtocol: unique symbol = Symbol.for('communicate.protocol');

declare module 'cordis' {
  interface Context {
    [Context.CommunicateProtocol]: Context.CommunicateProtocol<this>;
    [kProtocol]: { Server: Packages; Client: Packages };
    $communicate: CommunicationService<
      this[typeof kProtocol] & this[typeof Context.CommunicateProtocol]
    >;
  }

  namespace Context {
    const CommunicateProtocol: unique symbol;
    interface CommunicateProtocol<C extends Context = Context> {
      Server: S2CPackages;
      Client: C2SPackages;
    }
  }
}

export type MessageType = 'event' | 'request' | 'response';

interface Message {
  type: string;
  // deno-lint-ignore no-explicit-any
  body: any;
}

export interface Requests {
  ping(): void;
  plug(name: string): void;
}

export interface Events {
  disposed: {};
  ready: {};
  exit: {};
  error: {
    message: string;
  };
}

export interface C2SRequests extends Requests {}
export interface S2CRequests extends Requests {}
export interface C2SEvents extends Events {}
export interface S2CEvents extends Events {}

// deno-lint-ignore no-explicit-any
export type EventBodyOf<T extends Record<string, any>> = {
  [K in keyof T]: {
    name: K;
    data: T[K];
  };
};

type Stringify<T> = T extends string ? T : never;

export type RequestBodyOf<
  // deno-lint-ignore no-explicit-any
  T extends Record<K, any>,
  K extends string = Stringify<keyof T>,
> = {
  [K in keyof T]: {
    id: string;
    name: K;
    args: Parameters<T[K]>;
  };
};

export type ResponseBodyOf<
  // deno-lint-ignore no-explicit-any
  T extends Record<K, any>,
  K extends string = Stringify<keyof T>,
> = {
  [K in keyof T]: {
    id: string;
    error?: string;
    value: ReturnType<T[K]>;
  };
};

export interface AllPackagesOf<E extends Events, R extends Requests> {
  event: E;
  request: R;
  response: R;
}

export type BodyOf<K extends keyof P, P extends Packages> = K extends 'event'
  ? EventBodyOf<P['event']>
  : K extends 'request'
    ? RequestBodyOf<P['request']>
    : K extends 'response'
      ? ResponseBodyOf<P['response']>
      : never;

// deno-lint-ignore no-explicit-any
export type MessagesOf<Packages extends Record<MessageType, any>> = {
  [K in MessageType]: BodyOf<K, Packages>;
};

// deno-lint-ignore no-explicit-any
export type PackageStructOf<Packages extends Record<MessageType, any>> = {
  [K1 in MessageType]: {
    [K2 in keyof Packages[K1]]: {
      type: K1;
      body: BodyOf<K1, Packages>[K2];
    };
  };
};

export interface Packages extends AllPackagesOf<Events, Requests> {}
export interface C2SPackages extends AllPackagesOf<C2SEvents, C2SRequests> {}
export interface S2CPackages extends AllPackagesOf<S2CEvents, S2CRequests> {}

export type EventsOf<P extends Packages> = Stringify<keyof P['event']>;
export type RequestsOf<P extends Packages> = Stringify<keyof P['request']>;
export type ResponsesOf<P extends Packages> = Stringify<keyof P['response']>;

// deno-lint-ignore no-explicit-any
export type Handler = <T extends any[], R>(
  ...args: T
) => void | R | Awaitable<void | R>;
export type Listener<T> = (data: T) => Awaitable<void>;

export function detect(): CommunicationService.Type {
  if (
    // deno-lint-ignore ban-ts-comment
    // @ts-expect-error
    typeof WorkerGlobalScope !== 'undefined' &&
    // deno-lint-ignore ban-ts-comment
    // @ts-expect-error
    self instanceof WorkerGlobalScope
  ) {
    return 'worker';
  }
  if (process.channel) {
    return 'process';
  }
  return undefined;
}

// deno-lint-ignore no-explicit-any
function unwrapExports(module: any) {
  if ('default' in module) return module['default'];
  return module;
}

export const rt_path = await import.meta.resolve('@p/cp-rt');

export class CommunicationService<
  Protocol extends { Server: S2CPackages; Client: C2SPackages } = {
    Server: S2CPackages;
    Client: C2SPackages;
  },
> extends Service {
  declare S: Protocol['Server'];
  declare C: Protocol['Client'];

  public readonly isWorker: boolean;
  listeners: Dict<Listener<unknown>[]> = Object.create(null);
  handlers: Dict<Handler> = Object.create(null);
  responseHooks: Dict<[Function, Function]> = Object.create(null);
  conn: Communicator;
  #children: Dict<CommunicationService[]> = Object.create(null);
  #workers: Dict<CommunicationService[]> = Object.create(null);

  constructor(
    protected override ctx: Context,
    type: CommunicationService.Type = detect(),
  ) {
    super(ctx, '$communicate');

    switch (type) {
      case 'worker':
        this.conn = new InWorkerCommunicator(ctx);
        break;
      case 'process':
        this.conn = new ProcessCommunicator(ctx);
        break;
      case undefined:
      case null:
        this.conn = new NoopCommunicator();
        break;
      default:
        this.conn = type ?? new NoopCommunicator();
    }

    this.isWorker = this.conn.name === 'worker';
    // FIXME: deno type check doesn't work here somehow
    // deno-lint-ignore ban-ts-comment
    // @ts-ignore
    if (this.isWorker) ctx.logger.debug('running in worker');

    this._self.register('ping', noop);
    if (ctx.get('info')?.remotePlug)
      this._self.register('plug', async (name) => {
        const plugin = unwrapExports(await import(name));

        await ctx.plugin(plugin);
      });
    this._self.receive('error', (error) => {
      ctx
        .get('logger')?.(`remote:${this.conn.name}`)
        ?.warn('error:', error.message);
    });

    ctx.mixin('$communicate', {
      send: 'send',
      post: 'post',
    });
  }

  get _self(): CommunicationService {
    return <CommunicationService>(<unknown>this);
  }

  _workers = () => {
    return this.#workers;
  };

  _children = () => {
    return this.#children;
  };

  override [Service.extend](props: { conn: Communicator }) {
    const extended = super[Service.extend](props);
    if (this.conn !== props?.conn) extended.registerHandler();
    return extended;
  }

  spawn(modulePath: string | URL = rt_path) {
    const path = Bun.fileURLToPath(modulePath);
    const conn = new BunIPCCommunicator(this.ctx);
    const child = Bun.spawn(['bun', path], {
      ipc: conn.ipc.bind(conn),
      onExit: conn.onExit.bind(conn),
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    conn.init(child);
    const communicator = this[Service.extend]({
      conn,
    });
    (this._children()[modulePath.toString()] ??= []).push(communicator);
    return communicator as CommunicationService;
  }

  fork(modulePath: string | URL = rt_path, options?: cp.ForkOptions) {
    const child = cp.fork(modulePath, options);
    const communicator = this[Service.extend]({
      conn: new ChildProcessCommunicator(this.ctx, child),
    });
    (this._children()[modulePath.toString()] ??= []).push(communicator);
    return communicator as CommunicationService;
  }

  worker(specifier: string | URL = rt_path, options?: WorkerOptions) {
    const worker = new Worker(specifier, options);
    const communicator = this[Service.extend]({
      conn: new WorkerCommunicator(this.ctx, worker),
    });
    (this._workers()[specifier.toString()] ??= []).push(communicator);
    return communicator as CommunicationService;
  }

  registerHandler() {
    this.conn.on('message', async (message) => {
      try {
        if (!(await this.handler(message))) {
          this.ctx
            .get('logger')
            ?.debug('not implemented: ', Bun.inspect(message));
        }
      } catch (e) {
        await this._self.post('error' as const, {
          message: e instanceof Error ? e.message : 'error handling message',
        });
      }
    });
  }

  override async [Service.setup]() {
    this.registerHandler();

    await this._self.post('ready', {});
  }

  public receive<K extends Stringify<keyof this['S']['event']>>(
    name: K,
    handler: Listener<this['S']['event'][K]>,
  ) {
    this.listeners[name] ??= [];

    return this.ctx.effect(() => {
      this.listeners[name].push(handler as Listener<unknown>);
      return () => remove(this.listeners[name], handler);
    });
  }

  public register<
    K extends Stringify<keyof this['S']['request']>,
    H extends this['S']['request'][K],
  >(name: K, handler: H) {
    if (name in this.handlers) throw new Error('handler already exists');

    return this.ctx.effect(() => {
      this.handlers[name] = handler as Handler;
      return () => delete this.handlers[name];
    });
  }

  public async call<
    K extends Stringify<keyof this['C']['request']>,
    // deno-lint-ignore no-explicit-any
    H extends this['C']['request'][K] extends (...args: any[]) => any
      ? this['C']['request'][K]
      : never,
  >(name: K, ...args: Parameters<H>): Promisify<ReturnType<H>> {
    const id = `${name}-${Random.id()}`;

    const promise = new Promise<Promisify<ReturnType<H>>>((resolve, reject) => {
      this.ctx.effect(() => {
        this.responseHooks[id] = [resolve, reject];
        return () => delete this.responseHooks[id];
      });
    });

    this.sendHost('request', {
      id,
      name,
      args,
    } satisfies MessagesOf<this['C']>['request'][K]);

    return await promise;
  }

  public async post<K extends Stringify<keyof this['C']['event']>>(
    name: K,
    data: this['C']['event'][K],
  ) {
    this.sendHost('event', {
      name,
      data,
    } as MessagesOf<this['C']>['event'][K]);
  }

  public sendHost<T extends MessageType>(
    type: T,
    body: BodyOf<T, this['C']>[keyof BodyOf<T, this['C']>],
  ) {
    if (!this.conn.open) throw new Error('send on a closed channel');

    this.conn.send({
      type,
      body,
    });
  }

  protected async onRequest(body: BodyOf<'request', this['S']>) {
    const verify = Schema.object({
      id: Schema.string().required(),
      name: Schema.string().required(),
      args: Schema.array(Object).required(),
    });
    const { id, name, args } = verify(body);

    const handler = this.handlers[name];
    if (!handler) {
      this.sendHost('response', {
        id,
        error: name + ': not implemented',
        // deno-lint-ignore no-explicit-any
        value: undefined as any,
      });
      return;
    }

    this.sendHost('response', {
      id,
      value: (await Promise.try(handler, ...args).catch((error) => {
        this.sendHost('response', {
          id,
          error: String(error),
          // deno-lint-ignore no-explicit-any
          value: undefined as any,
        });
        // deno-lint-ignore no-explicit-any
      })) as any,
    });
    return true;
  }

  protected async onResponse(body: BodyOf<'response', this['S']>) {
    const verify = Schema.object({
      id: Schema.string().required(),
      error: Schema.string(),
      value: Schema.any(),
    });
    const { id, error, value } = verify(body);

    const hook = this.responseHooks[id];
    if (!hook) return false;

    const [resolve, reject] = hook;
    if (error) reject(error);
    else resolve(value);

    return delete this.responseHooks[id];
  }

  protected async onEvent(body: BodyOf<'response', this['S']>) {
    const verify = Schema.object({
      name: Schema.string().required(),
      data: Schema.any(),
    });
    const { name, data } = verify(body);
    const listeners = this.listeners[name] ?? [];
    const tasks = [];
    for (const listener of listeners) {
      tasks.push(
        (async () => await listener(data))().catch((reason) => {
          // FIXME: deno type check doesn't work here somehow
          // deno-lint-ignore ban-ts-comment
          // @ts-ignore
          this.ctx.logger.warn('error executing listener %c', listener);
          // deno-lint-ignore ban-ts-comment
          // @ts-ignore
          this.ctx.logger.warn(reason);
        }),
      );
    }
    await Promise.all(tasks);
    return true;
  }

  protected async handler(data: unknown) {
    const verify = Schema.object({
      type: Schema.string(),
      body: Schema.any(),
    });
    // deno-lint-ignore no-explicit-any
    const { type, body } = verify(data as any);
    switch (type) {
      case 'event':
        return await this.onEvent(body);
      case 'request':
        return await this.onRequest(body);
      case 'response':
        return await this.onResponse(body);
    }
    return false;
  }
}

export namespace CommunicationService {
  export type Type = 'worker' | 'process' | Communicator | undefined;

  const verify: Schema = Schema.union([
    Schema.const('worker'),
    Schema.const('process'),
    Schema.object({
      on: Schema.function().required(),
      off: Schema.function().required(),
      send: Schema.function().required(),
      getInner: Schema.function().required(),
      name: Schema.string().required(),
      open: Schema.boolean().required(),
    }),
    Schema.const(undefined),
  ]);

  const noop = new NoopCommunicator();

  export function Config(object: unknown) {
    try {
      const valid = verify(object);
      return valid ?? detect() ?? noop;
    } catch {
      return detect() ?? noop;
    }
  }
}
