import type { Context } from 'cordis'
import type Base from './base.ts'
import type { Handler } from './base.ts'
import type { ErrorLike, Subprocess } from 'bun'
import { EventEmitter } from 'node:events'

export class BunIPCCommunicator implements Base {
  #event = new EventEmitter()
  protected subproc!: Subprocess

  constructor(
    protected ctx: Context,
  ) {}

  init(subproc: Subprocess) {
    this.subproc = subproc
  }

  onExit(subproc: Subprocess, exitCode: number | null, signalCode: number | null, error?: ErrorLike) {
    this.#event.emit("exit", exitCode, subproc.signalCode ?? signalCode, error)
  }

  // deno-lint-ignore no-explicit-any
  ipc(message: any, _subproc: Subprocess) {
    this.#event.emit("message", message)
  }

  get open(): boolean {
    return this.subproc.exitCode === null
  }

  get name(): string {
    return 'Bun.spawn({ ipc })'
  }

  send(message: unknown, handle?: unknown): void {
    this.subproc.send(message)
  }

  on(type: 'exit', handler: (exitCode: number | null, signalCode: NodeJS.Signals | null, error?: ErrorLike) => void): () => Promise<void>;
  on(type: 'message', handler: Handler): () => Promise<void>;
  // deno-lint-ignore no-explicit-any
  on(type: string, handler: (...args: any[]) => void): () => Promise<void> {
    return this.ctx.effect(() => {
      this.#event.on(type, handler)
      return () => this.#event.off(type, handler)
    })
  }

  // deno-lint-ignore no-explicit-any
  off(type: 'message' | 'exit', handler: (...args: any[]) => void): void {
    this.#event.off(type, handler)
  }

  getInner(): Subprocess {
    return this.subproc
  }
}

export default BunIPCCommunicator
