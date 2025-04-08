import type { Awaitable } from 'cosmokit';
import type { SSEStreamingApi } from 'hono/streaming';
import type { C } from './cx';

export type SSECallback = (stream: SSEStreamingApi) => Promise<void>;
export type SSEHandler = (
  c: C,
) => Awaitable<(stream: SSEStreamingApi) => Promise<void>>;
