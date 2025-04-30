import { EventEmitter } from 'node:events';
import type { ErrorLike, Subprocess } from 'bun';
import type { Context } from 'cordis';
import type { Handler } from './base.ts';
import Base from './base.ts';

export class BunIPCCommunicator extends Base {
  #event = new EventEmitter();
  protected subproc!: Subprocess;

  constructor(protected ctx: Context) { super(); }

  init(subproc: Subprocess) {
    this.subproc = subproc;
  }

  onExit(
    subproc: Subprocess,
    exitCode: number | null,
    signalCode: number | null,
    error?: ErrorLike,
  ) {
    this.#event.emit('exit', exitCode, subproc.signalCode ?? signalCode, error);
  }

  // deno-lint-ignore no-explicit-any
  ipc(message: any, _subproc: Subprocess) {
    this.#event.emit('message', message);
  }

  override get open(): boolean {
    if ('connected' in this.subproc)
      return <boolean>this.subproc?.['connected'];
    return this.subproc.exitCode !== null;
  }

  override get name(): string {
    return 'bun_ipc'
  }

  override get display(): string {
    return 'Bun.spawn({ => ipc })';
  }

  override send(message: unknown, ..._transfer: unknown[]): void {
    this.subproc.send(message);
  }

  override on(
    type: 'exit',
    handler: (
      exitCode: number | null,
      signalCode: NodeJS.Signals | null,
      error?: ErrorLike,
    ) => void,
  ): () => Promise<void>;
  on(type: 'message', handler: Handler): () => Promise<void>;
  // deno-lint-ignore no-explicit-any
  on(type: string, handler: (...args: any[]) => void): () => Promise<void> {
    return this.ctx.effect(() => {
      this.#event.on(type, handler);
      return () => this.#event.off(type, handler);
    });
  }

  // deno-lint-ignore no-explicit-any
  override off(type: 'message' | 'exit', handler: (...args: any[]) => void): void {
    this.#event.off(type, handler);
  }

  override getInner(): Subprocess {
    return this.subproc;
  }
}

export default BunIPCCommunicator;
