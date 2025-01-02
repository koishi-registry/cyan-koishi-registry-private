import { Context } from '@p/core'
import { Schema } from '@cordisjs/plugin-schema'
import { Service } from 'cordis'
import { Hono } from 'hono'
import type { WSContext } from 'hono/ws'
import { upgradeWebSocket } from 'hono/deno'
import { TrieRouter } from 'hono/router/trie-router'
import type { BlankInput, H, Handler, RouterRoute } from 'hono/types'

declare module 'cordis' {
  export interface Context {
    hono: Server
    server: Server
    router: Server
  }

  export interface Events {
    'server/ready'(addr: Deno.NetAddr): void
  }
}

type WebSocketCallback = (socket: WebSocket, wsContext: WSContext) => void

export class Server extends Hono {
  override router: TrieRouter<
    // deno-lint-ignore no-explicit-any
    [Handler<any, any, BlankInput, any>, RouterRoute]
  >;
  [Service.tracker] = {
    associate: 'server',
    property: 'ctx',
  }
  public _server?: Deno.HttpServer<Deno.NetAddr>

  public host!: string
  public port!: number

  constructor(protected ctx: Context, protected config: Server.Config) {
    const router: TrieRouter<
      // deno-lint-ignore no-explicit-any
      [Handler<any, any, BlankInput, any>, RouterRoute]
    > = new TrieRouter()

    ctx.provide('server', undefined, true)
    ctx.alias('server', ['hono', 'router'])

    super({ router })
    this.router = router
    this.host = config.host!
    this.port = config.port!

    this.ctx.on('server/ready', (addr) => {
      this.ctx.logger.info(
        'listening on %C://%C:%C',
        addr.transport,
        addr.hostname,
        addr.port,
      )
    })

    this.ctx.on('ready', () => {
      this.notFound((c) => {
        // this.ctx.logger.debug("page not found\t\t", c.req.path)
        return c.text('Not Found', 404)
      })

      if (!this._server) {
        this._server = Deno.serve(
          {
            hostname: config.host,
            port: config.port,
            reusePort: true,
            onListen: (addr) => {
              this.host = addr.hostname
              this.port = addr.port

              this.ctx.emit('server/ready', addr)
            },
          },
          this.fetch,
        )
      }

      this.ctx.on('dispose', () => this._server?.shutdown())
    })

    ctx.set('server', this)

    // deno-lint-ignore no-this-alias
    const self = this

    ctx.on('internal/listener', function (name: string, listener: Function) {
      // deno-lint-ignore no-explicit-any
      if (
        name !== 'server/ready' || !(self as any)[Context.filter]?.(this) ||
        !self.port
      ) return
      listener()
      return () => false
    })
  }

  ws(path: string, callback?: WebSocketCallback) {
    this.get(
      path,
      upgradeWebSocket((_c) => {
        return {
          onOpen: (_, wsContext) => {
            this.ctx.on('dispose', () => wsContext.close())
            callback?.(wsContext.raw!, wsContext)
          },
        }
      }),
    )
  }

  get selfUrl() {
    const wildcard = ['0.0.0.0', '::']
    const host = wildcard.includes(this.host) ? '127.0.0.1' : this.host
    if (this.port === 80) {
      return `http://${host}`
    } else if (this.port === 443) {
      return `https://${host}`
    } else {
      return `http://${host}:${this.port}`
    }
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
