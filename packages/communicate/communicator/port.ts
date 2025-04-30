import type * as cp from 'node:child_process';
import type { Context } from 'cordis';
import Base, { type Handler } from './base.ts';
import type { TransferListItem } from 'node:worker_threads';

export class MessagePortCommunicator extends Base {
  #closed = false

  constructor(
    protected ctx: Context,
    protected port: MessagePort,
  ) {
    super();
    port.start()
    port.on('close', () => this.#closed = true)
  }

  override get open(): boolean {
    return this.port && !this.#closed;
  }

  override get name(): string {
    return 'message_port';
  }

  override get display(): string {
    return '<=> MessagePort';
  }

  override send(message: unknown, ...transfers: unknown[]): void {
    // deno-lint-ignore no-explicit-any
    this.port.postMessage(message, transfers as TransferListItem[]);
  }

  override on(type: 'message', handler: Handler) {
    return this.ctx.effect(() => {
      this.port.on(type, (message, handle) => void handler(message, handle));
      return () => this.off(type, handler);
    });
  }

  override off(type: 'message', handler: Handler): void {
    this.port.off(type, handler);
  }

  override getInner(): unknown {
    return this.port;
  }
}
