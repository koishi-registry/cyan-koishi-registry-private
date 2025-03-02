import { Context } from '@p/core'
import { Schema } from '@cordisjs/plugin-schema'
import { Service } from 'cordis'
import { pick } from 'cosmokit'
import { Hono } from 'hono'
import type { WSContext } from 'hono/ws'
import { createBunWebSocket } from 'hono/bun'
import { TrieRouter } from 'hono/router/trie-router'
import type { BlankInput, H, Handler, RouterRoute } from 'hono/types'
import type { Server as BunServer, ServerWebSocket } from 'bun'

const { upgradeWebSocket, websocket } = createBunWebSocket()

declare module '@p/core' {
  export interface Context {
    hono: Server
    server: Server
    router: Server
  }

  export interface Events {
    'server/ready'(url: URL): void
  }
}

export type WebSocketCallback = (
  socket: ServerWebSocket,
  wsContext: WSContext,
) => void

export class Server extends Hono {
  override router: TrieRouter<
    // biome-ignore lint/suspicious/noExplicitAny: expected
    [Handler<any, any, BlankInput, any>, RouterRoute]
  >;
  [Service.tracker] = {
    associate: 'server',
    property: 'ctx',
  }
  public _server?: BunServer

  public host!: string
  public port!: number

  constructor(protected ctx: Context, protected config: Server.Config) {
    const router: TrieRouter<
      // biome-ignore lint/suspicious/noExplicitAny: expected
      [Handler<any, any, BlankInput, any>, RouterRoute]
    > = new TrieRouter()

    ctx.provide('server', undefined, true)
    ctx.alias('server', ['hono', 'router'])

    super({ router })
    this.router = router
    Object.assign(this, pick(config, ['host', 'port']))

    this.ctx.on('server/ready', (url) => {
      this.ctx.logger.info(
        'listening on %C',
        url
      )
    })

    this.ctx.on('ready', () => {
      this.notFound((c) => {
        // this.ctx.logger.debug("page not found\t\t", c.req.path)
        return c.text('Not Found', 404)
      })

      if (!this._server) {
        this._server = Bun.serve(
          {
            hostname: config.host,
            port: config.port,
            reusePort: true,
            fetch: this.fetch
          },
        )
        this.ctx.emit('server/ready', this._server.url)
      }

      this.ctx.on('dispose', () => this._server?.stop())
    })

    ctx.set('server', this)

    const self = this

    ctx.on('internal/listener', function (name: string, listener: (...args: unknown[]) => unknown) {
      if (
        name !== 'server/ready' || (<{ [Context.filter]: (ctx: Context) => boolean }>(self as unknown))[Context.filter]?.(this) ||
        !self.port
      ) return
      listener()
      return () => false
    })
  }

  ws(path: string, callback: WebSocketCallback) {
    this.get(
      path,
      upgradeWebSocket((_c) => {
        return {
          onOpen: (_event, wsContext) => {
            this.ctx.on('dispose', () => wsContext.close())
            callback(wsContext.raw as ServerWebSocket, wsContext)
          },
        }
      }),
    )
  }

  get selfUrl() {
    const wildcard = ['0.0.0.0', '::']
    const host = wildcard.includes(this.host) ? '127.0.0.1' : this.host
    let protocol = 'http:'
    switch (this.port) {
      case 443:
        protocol = 'https:'
        break;
      default:
        protocol = 'http:'
        break;
    }
    if (this._server) {
      const url = new URL(this._server?.url)
      url.protocol = protocol
      url.hostname = host
      url.port = String(this.port)
    }

    return new URL(`${protocol}//${host}:${this.port}`)
  }

  protected override _addRoute(method: string, path: string, handler: H): void {
    super._addRoute(method, path, handler)
    this.ctx.scope.disposables.push(() => {
      this.router.remove(method, path)
    })
  }
}

export namespace Server {
  export interface Config {
    host?: string
    port?: number
  }

  export const Config = Schema.object({
    host: Schema.string().default('0.0.0.0'),
    port: Schema.natural().min(0).max(65535).default(8000),
  })
}
