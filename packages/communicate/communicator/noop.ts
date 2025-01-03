import Base, { type Handler } from './base.ts'

export class NoopCommunicator extends Base {
  constructor() {
    super();
  }

  override get name(): string {
    return "noop"
  }

  override getInner(): unknown {
    return null
  }

  override send(_message: unknown, _handle?: unknown): void {}

  override on(_type: 'message', _handler: Handler): () => Promise<void> {
    return () => Promise.resolve()
  }

  override off(_type: 'message', _handler: Handler): void {}
}
