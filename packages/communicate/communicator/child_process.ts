import type { Context } from 'cordis'
import Base, { type Handler } from './base.ts'
import type * as cp from 'node:child_process'

export class ChildProcessCommunicator extends Base {
  constructor(protected ctx: Context, protected cp: cp.ChildProcess) {
    super()
  }

  override get open(): boolean {
    return this.cp?.connected && !!this.cp?.channel
  }

  override get name(): string {
    return 'child_process'
  }

  override send(message: unknown, handle?: unknown): void {
    // deno-lint-ignore no-explicit-any
    this.cp.send(message as any, handle as any)
  }

  override on(type: 'message', handler: Handler) {
    return this.ctx.effect(() => {
      this.cp.on(type, (message, handle) => void handler(message, handle))
      return () => this.off(type, handler)
    })
  }

  override off(type: 'message', handler: Handler): void {
    this.cp.off(type, handler)
  }

  override getInner(): unknown {
    return this.cp
  }
}
