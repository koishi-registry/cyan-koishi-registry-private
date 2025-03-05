import type { Context } from 'cordis';
import Base, { type Handler } from './base.ts';
import * as proc from 'node:process';

export class ProcessCommunicator extends Base {
  constructor(
    protected ctx: Context,
    protected p: NodeJS.Process = import.meta.require('node:process'),
  ) {
    super();
  }

  override get open(): boolean {
    return !!this.p?.channel;
  }

  override get name(): string {
    return 'process';
  }

  override send(message: unknown, handle?: unknown): void {
    // deno-lint-ignore no-explicit-any
    this.p.send?.(message as any, handle as any);
  }

  override on(type: 'message', handler: Handler) {
    return this.ctx.effect(() => {
      this.p.on(type, handler);
      return () => this.off(type, handler);
    });
  }

  override off(type: 'message', handler: Handler): void {
    this.p.off(type, handler);
  }

  override getInner(): unknown {
    return this.p;
  }
}
