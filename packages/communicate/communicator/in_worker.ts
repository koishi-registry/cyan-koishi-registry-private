import type { Context } from 'cordis'
import Base, { type Handler } from './base.ts'
import { symbols, type OnMessage } from './worker_base.ts'

export class InWorkerCommunicator extends Base {
  constructor(protected ctx: Context) {
    super()
  }

  override get open(): boolean {
    return !!self.postMessage
  }

  override get name(): string {
    return 'worker'
  }

  override send(message: unknown, handle?: unknown): void {
    return self.postMessage(message, [handle])
  }

  override on(type: 'message', handler: Handler) {
    if (type !== 'message') throw new Error("non message")
    return this.ctx.effect(() => {
      const onmessage = ((event: MessageEvent) => {
        try {
          onmessage[symbols.original]?.(event);
        } finally {
          onmessage[symbols.handler]?.(event.data, Array.isArray(event.ports) && event.ports.length ? event.ports[0] : undefined)
        }
      }) as OnMessage
      onmessage[symbols.handler] = handler
      onmessage[symbols.original] = self.onmessage
      self.onmessage = onmessage

      return () => delete onmessage[symbols.handler]
    })
  }

  override off(type: 'message', handler: Handler): void {
    if (type !== 'message') throw new Error("non message")
    let onmessage: OnMessage | undefined = self.onmessage as OnMessage
    while (onmessage) {
      if (onmessage[symbols.handler] === handler) {
        delete onmessage[symbols.handler]
        break
      }
      onmessage = onmessage[symbols.original]
    }
  }

  getInner(): unknown {
    return self;
  }
}
