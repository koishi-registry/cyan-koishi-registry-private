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

  override get open(): boolean {
    return !!this.worker.postMessage;
  }

  override get name(): string {
    return "child_worker";
  }

  override send(message: unknown, handle?: unknown): void {
    // deno-lint-ignore no-explicit-any
    if (handle) this.worker.postMessage(message, handle as any);
    else this.worker.postMessage(message);
  }

  override on(type: "message", handler: Handler) {
    if (type !== "message") throw new Error("on is called with non-'message' type");
    return this.ctx.effect(() => {
      const onmessage = ((event: MessageEvent) => {
        try {
          onmessage[symbols.original]?.(event);
        } finally {
          onmessage[symbols.handler]?.(
            event.data,
            Array.isArray(event.ports) && event.ports.length
              ? event.ports[0]
              : undefined,
          );
        }
      }) as OnMessage;
      onmessage[symbols.handler] = handler;
      onmessage[symbols.original] = this.worker['onmessage'];
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
