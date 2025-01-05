import type { Context } from '@p/core'
import { Service } from 'cordis'
import type { Awaitable } from 'cosmokit'

export abstract class Storage extends Service {
  protected constructor(ctx: Context, name: string) {
    ctx.provide(`storage.${name}`, undefined, true)
    super(ctx, `storage.${name}`)
  }

  abstract has(key: string): Awaitable<boolean>
  async get<T>(key: string): Promise<T | null> {
    const string = await this.getRaw(key)
    if (string !== null) return JSON.parse(string)
    return null
  }
  async set<T>(key: string, value: T): Promise<void> {
    await this.setRaw(key, JSON.stringify(value))
  }
  abstract remove(key: string): Awaitable<void>
  abstract setRaw(key: string, value: string): Awaitable<void>
  abstract getRaw(key: string): Awaitable<string | null>
  protected _clear(): Awaitable<void> {}
}

export namespace Storage {
  // deno-lint-ignore no-empty-interface
  export interface Services {}
}

export default Storage
