import { type Context, Service, symbols } from 'cordis'
import type { Awaitable } from "cosmokit";
import type { Storage } from '@p/storage'

declare module 'cordis' {
  export interface Context {
    storage: StorageService
  }
}

export class StorageService extends Service {
  constructor(protected override ctx: Context, public serviceName?: keyof Storage.Services) {
    ctx.provide(`storage`, undefined, true)
    super(ctx, `storage`)
  }

  get provider(): Storage {
    return this.ctx.get(`storage.${this.serviceName}`)!
  }

  override [symbols.setup]() {
    this.serviceName = this.ctx.$communicate.conn.name === 'worker' ? 'remote' : 'localstorage'

    return new Promise<void>(resolve => {
      this.ctx.inject([`storage.${this.serviceName}`], () => resolve())
    })
  }

  has(key: string): Awaitable<boolean> {
    return this.provider.has(key)
  }

  get<T>(key: string): Promise<T | null> {
    return this.provider.get(key)
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.provider.set(key, value)
  }

  remove(key: string): Awaitable<void> {
    return this.provider.remove(key)
  }

  protected _clear(): Awaitable<void> {
    if (this.ctx.scope.uid !== 0) throw new Error("invalid clear")
    return this.provider?.['_clear']?.()
  }
}

export default StorageService
