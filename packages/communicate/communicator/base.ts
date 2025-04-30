import type { Awaitable } from 'cosmokit';
import type {} from '../mod.ts';

export type Handler = (message: unknown, raw?: unknown) => Awaitable<void>;

export abstract class Communicator {
  abstract get name(): string;
  abstract get display(): string;

  get open(): boolean {
    return true;
  }

  features(): Communicator.Features {
    return {
      transfer: false
    }
  }

  abstract off(type: 'message', handler: Handler): void;

  abstract on(type: 'message', handler: Handler): () => Promise<void>;

  abstract send(message: unknown, ...transfers: unknown[]): void;

  abstract getInner(): unknown;
}

export namespace Communicator {
  export interface Features {
    transfer?: boolean
  }
}

export default Communicator
