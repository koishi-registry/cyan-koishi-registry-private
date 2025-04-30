import type { Context } from "cordis";
import Base, { type Handler } from "./base.ts";
import { type OnMessage, symbols } from "./worker_base.ts";

export class WorkerCommunicator extends Base {
  constructor(
    protected ctx: Context,
    protected worker: Worker,
  ) {
    super();
    if (!worker['onerror'])
      worker['onerror']= (event: ErrorEvent) => {
        if (event.error) throw event.error;
        throw new Error("Error in worker", { cause: event.error || event.message });
      };
  }

  features(): Base.Features {
    return {
      transfer: true
    }
  }

  override get open(): boolean {
    return !!this.worker.postMessage;
  }

  override get name() {
    return 'worker'
  }

  override get display(): string {
    return `=> Worker@${this.worker.threadId}(...)`;
  }

  override send(message: unknown, ...transfers: unknown[]): void {
    // deno-lint-ignore no-explicit-any
    this.worker.postMessage(message, transfers as MessagePort[]);
  }

  override on(type: "message", handler: Handler) {
    if (type !== "message") throw new Error("on is called with non-'message' type");
    return this.ctx.effect(() => {
      const onmessage = ((event: MessageEvent) => {
        try {
          onmessage[symbols.original]?.(event);
        } finally {
          onmessage[symbols.handler]?.(
            event.data, event
          );
        }
      }) as OnMessage;
      onmessage[symbols.handler] = handler;
      onmessage[symbols.original] = this.worker['onmessage'] || void 0;
      this.worker['onmessage']= onmessage;

      return () => delete onmessage[symbols.handler];
    });
  }

  override off(type: "message", handler: Handler): void {
    if (type !== "message") throw new Error("non message");
    let onmessage: OnMessage | undefined = this.worker['onmessage'] as OnMessage;
    while (onmessage) {
      if (onmessage[symbols.handler] === handler) {
        delete onmessage[symbols.handler];
        break;
      }
      onmessage = onmessage[symbols.original];
    }
  }

  override getInner(): unknown {
    return this.worker;
  }
}
