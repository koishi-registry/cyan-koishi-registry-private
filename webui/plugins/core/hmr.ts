import type { WebUI } from './mod.ts'
import type { Awaitable } from "cosmokit";

export type WatchType = "unlink";

export class WebUIHMR {
  readonly watchers: Record<WatchType, ((file: string) => Awaitable<void>)[]> = Object.create(null);

  constructor(public core: WebUI) {}

  on(event: WatchType, callback: (file: string) => void) {
    (this.watchers[event] ??= []).push(callback);
    // todo!()
  }
}
