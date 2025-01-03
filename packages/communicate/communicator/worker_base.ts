import { Handler } from "./base.ts";

declare global {
  interface Window {
    // deno-lint-ignore ban-ts-comment
    // @ts-ignore
    onmessage?: (this: WindowEventHandlers, ev: MessageEvent) => Awaitable<void>

    postMessage?<T>(data: T, transferable: unknown[]): void
  }
}

export namespace symbols {
  // deno-lint-ignore no-explicit-any
  export const original: unique symbol = <any>Symbol.for('communicator.original')
  // deno-lint-ignore no-explicit-any
  export const handler: unique symbol = <any>Symbol.for('communicator.handler')
}

export type OnMessage = { (event: MessageEvent): void, [symbols.original]?: OnMessage, [symbols.handler]?: Handler }
