import type { Context } from 'cordis';
import Base, { type Handler } from './base.ts';
import { type OnMessage, symbols } from './worker_base.ts';

declare let self: Worker;

export class InWorkerCommunicator extends Base {
  constructor(protected ctx: Context) {
    super();
  }

  override get open(): boolean {
    return !!self.postMessage;
  }

  override get name(): string {
    return 'worker';
  }

  override send(message: unknown, handle?: unknown): void {
    // biome-ignore lint/suspicious/noExplicitAny: it should be work
    if (handle) self.postMessage(message, [handle] as any);
    else self.postMessage(message);
  }

  override on(type: 'message', handler: Handler) {
    if (type !== 'message') throw new Error('non message');
    return this.ctx.effect(() => {
      if (self.addListener) self.addListener('message', (event) => handler(event.data, event.ports))
      else if (self['addEventListener']) self['addEventListener']('message', (event) => handler(event.data, event.ports))
      else {
        const onmessage = ((event: MessageEvent) => {
          try {
            onmessage[symbols.original]?.(event);
          } finally {
            onmessage[symbols.handler]?.(
              event.data,
              event.ports,
            );
          }
        }) as OnMessage;
        onmessage[symbols.handler] = handler;
        onmessage[symbols.original] = self['onmessage'];
        self['onmessage']= onmessage;
        return () => delete onmessage[symbols.handler];
      }
      return () => this.off('message', handler);
    });
  }

  override off(type: 'message', handler: Handler): void {
    if (type !== 'message') throw new Error('non message');
    if (self.removeListener) self.removeListener('message', handler)
    else if (self['removeEventListener']) self['removeEventListener']('message', handler)
    else {
      let onmessage: OnMessage | undefined = self['onmessage'] as OnMessage;
      while (onmessage) {
        if (onmessage[symbols.handler] === handler) {
          delete onmessage[symbols.handler];
          break;
        }
        onmessage = onmessage[symbols.original];
      }
    }
  }

  getInner(): unknown {
    return self;
  }
}
