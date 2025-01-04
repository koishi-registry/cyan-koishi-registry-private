import type { CommunicationService } from '../mod.ts'
import { Awaitable } from 'cosmokit'

export type Handler = (message: unknown, handle?: unknown) => Awaitable<void>

export default abstract class Communicator {
  abstract get name(): string

  get open(): boolean {
    return true
  }

  abstract off(type: 'message', handler: Handler): void

  abstract on(type: 'message', handler: Handler): () => Promise<void>

  abstract send(message: unknown, handle?: unknown): void

  abstract getInner(): unknown
}
