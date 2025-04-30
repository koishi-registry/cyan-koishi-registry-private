import { type Context, Service } from '@p/core';
import type { C, SSECallback } from '@plug/server';
import type { ServerWebSocket } from 'bun';
import type { Dict } from 'cosmokit';
// import type { WebSocket } from './types.ts'
import type * as hono from 'hono';
import type { WSContext, WSEvents } from 'hono/ws';
import { Client } from './client.ts';
import { Entry } from './entry.ts';
import { HmrInterest } from './hmr.ts';

export * from './client.ts';
export * from './entry.ts';
export * from './manifest.ts';

declare module '@p/core' {
  interface Context {
    krat: KratIntrinsic;
  }

  interface Events {
    'krat/connection'(client: Client): void;
  }
}

// deno-lint-ignore no-explicit-any
export type SocketListener = (this: Client, ...args: any) => void;

export abstract class KratIntrinsic extends Service {
  public id = Math.random().toString(36).slice(2);
  public hmr: HmrInterest = new HmrInterest(this);

  readonly entries: Dict<Entry> = Object.create(null);
  // deno-lint-ignore no-explicit-any
  readonly listeners: Dict<(args?: any) => unknown> = Object.create(null);
  readonly clients: Dict<Client> = Object.create(null);
  public abstract baseURL: URL;

  protected constructor(public override ctx: Context) {
    super(ctx, 'krat');
  }

  abstract resolveEntry(entry: Entry): Promise<string[]>;

  abstract addListener<K extends keyof Events>(
    event: K,
    callback: Events[K],
  ): void;

  addEntry<T>(info: Entry.Info, data?: (client: Client) => T) {
    return new Entry(this.ctx, info, data);
  }

  async broadcast<T>(type: string, body: T) {
    const handles = Object.values(this.clients);
    if (!handles.length) return;
    await Promise.all(
      Object.values(this.clients).map(async (client) => {
        const data = { type, body };
        if (typeof body === 'function') data.body = await body(client);
        await client.send(data);
      }),
    );
  }

  protected accept(c: C): SSECallback {
    return async (stream) => {
      const client = new Client(this.ctx, stream);
      await client.init();
      await client.closed;
    };
  }
}

// deno-lint-ignore no-empty-interface
export interface Events {}

export namespace KratIntrinsic {
  // deno-lint-ignore no-empty-interface
  export interface Services {}
}

export default KratIntrinsic;
