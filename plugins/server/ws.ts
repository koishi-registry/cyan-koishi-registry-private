import type { Awaitable } from 'cosmokit';
import type { WSEvents } from 'hono/ws';
import type { C } from './cx';

export type WebSocketCallback = (cx: C) => Awaitable<WSEvents>;
