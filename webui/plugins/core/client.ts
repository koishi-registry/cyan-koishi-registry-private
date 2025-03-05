import type { Context } from '@p/core';
import { randomId } from '@kra/utils'
import { Logger } from '@cordisjs/plugin-logger';
import { mapValues } from 'cosmokit';
import type { Entry } from './entry.ts';
import type { WSContext, WSMessageReceive } from 'hono/ws';
import type { WebSocket } from './types.ts';
import type {} from './mod.ts'
import type { SSEStreamingApi } from 'hono/streaming';
import type { C } from '@plug/server';
import { ClientState } from './state.ts';
import type { Disposable } from 'cordis';

const logger = new Logger('webui');

export interface ClientEvents {
  'entry:init'(data: Entry.Init): void;
  'entry:update'(data: Entry.Update): void;
  'entry:patch'(data: Entry.Patch): void;
}

export interface EventPack {
  type: string,
  body: unknown
}

export interface TypedEventPack<K extends keyof ClientEvents> extends EventPack {
  type: K,
  body: Parameters<ClientEvents[K]>[0]
}

export class Client {
  readonly id = randomId();

  // biome-ignore lint/suspicious/noExplicitAny: state can be any
  #state: Map<string, Map<string, any>> = new Map();

  closed: Promise<void>
  close: () => void

  constructor(
    readonly ctx: Context,
    public stream: SSEStreamingApi,
  ) {
    const { resolve, promise } = Promise.withResolvers<void>()
    this.closed = promise
    this.close = resolve

    const webui = this.ctx.get('webui')!;
    const body: Entry.Init = {
      entries: mapValues(webui.entries, (entry) => entry.toJSON(this)!),
      serverId: webui.id,
      clientId: this.id,
    };
    this.send({ type: 'entry:init', body });
  }

  state(id: string): ClientState {
    let state: ClientState;
    this.ctx.effect(() => {
      const [state_, dispose] = this._state(id);
      state = state_;
      return dispose
    })
    return state;
  }

  private _state = (id: string): [ClientState, Disposable] => {
    if (!this.#state.has(id)) this.#state.set(id, new Map());
    return [new ClientState(() => this.#state.get(id)), () => this.#state.delete(id)];
  }

  send<K extends keyof ClientEvents>(payload: EventPack | TypedEventPack<K>) {
    return this.stream.writeSSE({
      event: payload.type,
      data: JSON.stringify(payload.body)
    });
  }

  handle = async (c: C) => {
    const { type, body } = JSON.parse(await c.req.json());
    const listener = this.ctx.get('webui')!.listeners[type];
    if (!listener) {
      logger.debug('unknown rpc:', type, body);
      return;
    }
    return listener.call(this, body);
  };
}
