import { Context, Service } from 'cordis'
import Random from 'inaba'
import { remove } from 'cosmokit'
import type { Dict, Awaitable, Promisify } from 'cosmokit'

declare module 'cordis' {
  export interface Context {
    $communicate: CommunicationService
  }
}

export type MessageType = 'event' | 'request' | 'response'

interface Message {
  type: string,
  // deno-lint-ignore no-explicit-any
  body: any
}

export interface ServerRequests {
  'ping'(): void
}

export interface ClientRequests {
  'ready'(): void
}

export interface ServerEvents {
  'dispose': {}
}

export interface ClientEvents {
  'dispose': {}
}

export type PackageOf<T> = {
  [K in keyof T]: {
    name: K,
    data: T[K]
  }
}[keyof T]

type Stringify<T> = T extends string ? T : never

// deno-lint-ignore no-explicit-any
export type RequestsOf<T extends Record<K, (...args: any) => any>, K extends string = Stringify<keyof T>> = {
  [K in keyof T]: {
    id: string,
    name: K,
    args: Parameters<T[K]>
  }
}[keyof T]

// deno-lint-ignore no-explicit-any
export type ResponseOf<T extends Record<K, (...args: any) => any>, K extends string = Stringify<keyof T>> = {
  [K in keyof T]: {
    id: string,
    return: ReturnType<T[K]>
  }
}[keyof T]

export interface ClientPackages {
  event: PackageOf<ClientEvents>,
  request: RequestsOf<ClientRequests>,
  response: ResponseOf<ClientRequests>
}

export interface ServerPackages {
  event: PackageOf<ServerEvents>,
  request: RequestsOf<ServerRequests>,
  response: ResponseOf<ServerRequests>
}

export type PackOf<T, P> = T extends keyof P ? P[T] : never

export interface C2SMessage<T extends MessageType> {
  type: T,
  body: PackOf<T, ClientPackages>,
}

export interface S2CMessage<T extends MessageType> {
  type: T,
  body: PackOf<T, ServerPackages>,
}

// deno-lint-ignore no-explicit-any
export type Handler = <T extends any[], R>(...args: T) => void | R | Awaitable<void | R>
export type Listener<T> = (data: T) => Awaitable<void>

export class CommunicationService extends Service {
  public readonly isWorker: boolean
  listeners: Dict<Listener<unknown>[]> = Object.create(null)
  handlers: Dict<Handler> = Object.create(null)
  responseHooks: Dict<[Function, Function]> = Object.create(null)

  constructor(protected override ctx: Context, protected options: CommunicationService.Config = { self }) {
    super(ctx, '$communicate');

    // noinspection TypeScriptUnresolvedReference
    // deno-lint-ignore ban-ts-comment
    // @ts-expect-error
    this.isWorker = typeof WorkerGlobalScope !== 'undefined' && this.options.self instanceof WorkerGlobalScope
    if (this.isWorker) console.log("run in worker")
    else console.log("not in worker")

    ctx.mixin('$communicate', {
      sendMessage: 'send',
      postEvent: 'post'
    })

    if (this.isWorker)
      ctx.effect(() => {
        const original = options.self.onmessage

        options.self.onmessage = async (event: MessageEvent) => {
          if (!await this.handler(event)) return original?.(event)
        }

        return () => {
          options.self.onmessage = original
        }
      })
  }

  assertWorker() {
    if (!this.isWorker) throw new Error("not in a worker")
  }

  public receive<K extends keyof ServerEvents>(name: K, handler: Listener<ServerEvents[K]>) {
    this.assertWorker()

    this.listeners[name] ??= []

    return this.ctx.effect(() => {
      this.listeners[name].push(handler as Listener<unknown>)
      return () => remove(this.listeners[name], handler)
    })
  }

  public register<K extends keyof ServerRequests>(name: K, handler: ServerRequests[K]) {
    if (name in this.handlers) throw new Error("handler already exists")
    this.assertWorker()

    return this.ctx.effect(() => {
      this.handlers[name] = handler
      return () => delete this.handlers[name]
    })
  }

  public async call<K extends Stringify<keyof ClientRequests>>(name: K, ...args: Parameters<ClientRequests[K]>): Promisify<ReturnType<ClientRequests[K]>> {
    const id = name + '-' + Random.id()

    const promise = new Promise<Promisify<ReturnType<ClientRequests[K]>>>((resolve, reject) => {
      this.ctx.effect(() => {
        this.responseHooks[id] = [resolve, reject]
        return () => delete this.responseHooks[id]
      })
    })

    this.sendHost("request", {
      id,
      name,
      args
    })

    return await promise
  }

  public async postEvent<K extends keyof ClientEvents>(name: K, data: ClientEvents[K]) {
    this.sendHost('event', {
      name,
      data
    })
  }

  public sendHost<T extends MessageType>(type: T, body: C2SMessage<T>['body']) {
    this.assertWorker()

    this.options.self.postMessage<Message>({
      type,
      body
    })
  }

  private async handler(event: MessageEvent) {
    console.log(event)
    return false;
  }
}

declare global {
  interface Window {
    // deno-lint-ignore ban-ts-comment
    // @ts-ignore
    onmessage: (this: WindowEventHandlers, ev: MessageEvent) => Awaitable<void>

    postMessage<T>(data: T): void
  }
}

export namespace WorkerService {
  export interface Config {
    self: Window
  }

  // self = globalThis
  // will exceed call stack limit
  // export const Config: Schema<Config> = Schema.object({
  //   self: Schema.any().default(self)
  // })
}



