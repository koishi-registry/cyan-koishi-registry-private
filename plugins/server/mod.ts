// import type { Server as BunServer, ServerWebSocket } from 'bun';
import { type Server as HttpServer, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { symbols } from '@cordisjs/core';
import { Schema } from '@cordisjs/plugin-schema';
import { type Http2Bindings, serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import type { Context } from '@p/core';
import { Service } from 'cordis';
import { type Awaitable, pick } from 'cosmokit';
import type * as hono from 'hono';
import { TrieRouter } from 'hono/router/trie-router';
import { type SSEStreamingApi, streamSSE } from 'hono/streaming';
import type { BlankInput, H, Handler, RouterRoute } from 'hono/types';
import type { UpgradeWebSocket, WSContext, WSEvents } from 'hono/ws';
import type { WebSocket } from 'ws';
import { type Bindings, Hono } from './cx';
import type { SSEHandler } from './sse';
import type { WebSocketCallback } from './ws';

export * from './cx';
export * from './sse';
export * from './ws';

declare module '@p/core' {
  export interface Context {
    hono: Server;
    server: Server;
    router: Server;
  }

  export interface Events {
    'server/ready'(address: AddressInfo): void;
  }
}

export class Server extends Hono {
  declare router: TrieRouter<
    // biome-ignore lint/suspicious/noExplicitAny: expected
    [Handler<{ Bindings: Bindings }, any, BlankInput, any>, RouterRoute]
  >;
  [Service.tracker] = {
    associate: 'server',
    property: 'ctx',
  };
  public _server?: HttpServer;

  #upgradeWebSocket: UpgradeWebSocket<WebSocket>;

  public host!: string;
  public port!: number;

  constructor(
    protected ctx: Context,
    protected config: Server.Config,
  ) {
    const router: TrieRouter<
      // biome-ignore lint/suspicious/noExplicitAny: expected
      [Handler<{ Bindings: Bindings }, any, BlankInput, any>, RouterRoute]
    > = new TrieRouter();

    ctx.provide('server', undefined, true);
    ctx.alias('server', ['hono', 'router']);

    super({ router });
    this.router = router;
    Object.assign(this, pick(config, ['host', 'port']));

    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
      app: this,
    });
    this.#upgradeWebSocket = upgradeWebSocket;

    this.ctx.on('server/ready', () => {
      this.ctx.logger.info('listening on %C', this.selfUrl);
    });

    this.ctx.on('ready', () => {
      this.notFound((c) => {
        // this.ctx.logger.debug("page not found\t\t", c.req.path)
        return c.text('Not Found', 404);
      });

      if (!this._server) {
        this._server = <HttpServer>serve({
          fetch: this.fetch,
          hostname: config.host,
          port: config.port,
          createServer,
        });
        injectWebSocket(this._server);
        // this._server.on('request', ()=>console.log('request'))
        // this._server.on('stream', ()=>console.log('stream'))
        this.ctx.emit('server/ready', <AddressInfo>this._server.address());
      }

      this.ctx.on(
        'dispose',
        () =>
          new Promise<void>((resolve) => this._server?.close(() => resolve())),
      );
    });

    ctx.set('server', this);

    const self: Server = this;

    ctx.on(
      'internal/listener',
      function (
        this: Context,
        name: string,
        listener: (...args: unknown[]) => unknown,
      ) {
        if (
          name !== 'server/ready' ||
          Reflect.get(self, symbols.filter)?.(this) ||
          !self.port
        )
          return;
        listener();
        return () => false;
      },
    );
  }

  sse(path: string, callback: SSEHandler) {
    this.get(path, async (c) => {
      const cb = await callback(c);
      return streamSSE(c, async (stream) => cb(stream));
    });
  }

  ws = (path: string, callback: WebSocketCallback) => {
    this.get(
      path,
      this.#upgradeWebSocket(async (c) => {
        return await callback(c);
      }),
    );
  };

  get selfUrl() {
    const wildcard = ['0.0.0.0', '::'];
    const host = wildcard.includes(this.host) ? '127.0.0.1' : this.host;
    let protocol = 'http:';
    switch (this.port) {
      case 443:
        protocol = 'https:';
        break;
      default:
        protocol = 'http:';
        break;
    }
    if (this._server) {
      const addr = <AddressInfo>this._server.address();
      if (!addr) return new URL(`${protocol}//${host}:${this.port}`)

      const url = new URL(`${protocol}//${host}:${addr.port}`);
      url.protocol = protocol;
      url.hostname = host;
      url.port = String(this.port);
    }

    return new URL(`${protocol}//${host}:${this.port}`);
  }

  protected override _addRoute(method: string, path: string, handler: H): void {
    super._addRoute(method, path, handler);
    this.ctx.scope.disposables.push(() => {
      this.router.remove(method, path);
    });
  }
}

export namespace Server {
  export interface Config {
    host?: string;
    port?: number;
  }

  export const Config = Schema.object({
    host: Schema.string().default('0.0.0.0'),
    port: Schema.natural().min(0).max(65535).default(5477),
  });
}
