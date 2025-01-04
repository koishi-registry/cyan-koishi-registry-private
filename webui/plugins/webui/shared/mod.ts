import { type Context, Service } from 'cordis'
import type { Dict } from 'cosmokit'
import { Client } from './client.ts'
import { Entry } from './entry.ts'
import type { WebSocket } from './types.ts'
import type { WSContext } from 'hono/ws'

export * from './client.ts'
export * from './entry.ts'

declare module 'cordis' {
  interface Context {
    webui: WebUI
  }

  interface Events {
    'webui/connection'(client: Client): void
  }
}

// deno-lint-ignore no-explicit-any
export type SocketListener = (this: Client, ...args: any) => void

export abstract class WebUI extends Service {
  public id = Math.random().toString(36).slice(2)

  readonly entries: Dict<Entry> = Object.create(null)
  // deno-lint-ignore no-explicit-any
  readonly listeners: Dict<(args?: any) => unknown> = Object.create(null)
  readonly clients: Dict<Client> = Object.create(null)

  protected constructor(public override ctx: Context) {
    super(ctx, 'webui')
    this.listeners.ping = function () {
      this.send({ type: 'pong' })
    }
  }

  abstract resolveEntry(files: Entry.Files, key: string): string[]

  abstract addListener<K extends keyof Events>(
    event: K,
    callback: Events[K],
  ): void

  addEntry<T>(files: Entry.Files, data?: (client: Client) => T) {
    return new Entry(this.ctx, files, data)
  }

  async broadcast<T>(type: string, body: T) {
    const handles = Object.values(this.clients)
    if (!handles.length) return
    await Promise.all(
      Object.values(this.clients).map(async (client) => {
        const data = { type, body }
        if (typeof body === 'function') data.body = await body(client)
        client.socket.send(JSON.stringify(data))
      }),
    )
  }

  protected accept(socket: WebSocket, wsContext?: WSContext) {
    const client = new Client(this.ctx, socket, wsContext)
    socket.addEventListener('close', () => {
      delete this.clients[client.id]
      this.ctx.emit('webui/connection', client)
    })
    this.clients[client.id] = client
    this.ctx.emit('webui/connection', client)
  }
}

// deno-lint-ignore no-empty-interface
export interface Events {}

export namespace WebUI {
  // deno-lint-ignore no-empty-interface
  export interface Services {}
}

export default WebUI
