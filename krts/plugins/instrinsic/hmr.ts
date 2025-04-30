import type { Awaitable } from 'cosmokit';
import type { KratIntrinsic } from './mod.ts';

export type WatchType = 'unlink';

export class HmrInterest {
  readonly watchers: Record<WatchType, ((file: string) => Awaitable<void>)[]> =
    Object.create(null);

  constructor(public core: KratIntrinsic) {}

  on(event: WatchType, callback: (file: string) => void) {
    (this.watchers[event] ??= []).push(callback);
    // todo!()
  }
}
