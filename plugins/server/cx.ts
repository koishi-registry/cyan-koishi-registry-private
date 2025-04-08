import type { Http2Bindings } from '@hono/node-server';
import { type Context, Hono as _Hono } from 'hono';

export type Bindings = Http2Bindings & {};
export type C = Context<{ Bindings: Bindings }>;
export const Hono = _Hono<{ Bindings: Bindings }>;
