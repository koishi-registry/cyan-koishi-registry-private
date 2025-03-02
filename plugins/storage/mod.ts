import { type Context, Service, symbols } from 'cordis'
import type { Awaitable } from 'cosmokit'
import type { Storage } from '@p/storage'
import StorageLocalStorage from "./localstorage.ts";
import StorageRemoteStorage from "./remote.ts";
import StorageBunSqlite from './bun-sqlite.ts';

declare module '@p/core' {
  export interface Context {
    storage: StorageService
  }
}

export class StorageService extends Service {
  constructor(
    protected override ctx: Context,
    public serviceName?: keyof Storage.Services,
  ) {
    ctx.provide('storage', undefined, true)
    super(ctx, 'storage')

    const ctx1 = ctx.isolate('storage')

    const scope1 = ctx1.plugin(StorageLocalStorage)
    const scope2 = ctx1.plugin(StorageRemoteStorage)
    const scope3 = ctx1.plugin(StorageBunSqlite)
    ctx.on('dispose', () => {
      scope1.dispose()
      scope2.dispose()
      scope3.dispose()
    })
  }

  get provider(): Storage {
    return this.ctx.get(`storage.${this.serviceName}`)!
  }

  override [symbols.setup]() {
    this.serviceName = this.ctx.$communicate.conn.name === 'worker'
      ? 'remote'
      : typeof Deno === 'undefined' ? 'bun.sqlite' : 'localstorage'

    return new Promise<void>((resolve) => {
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
    if (this.ctx.scope.uid !== 0) throw new Error('invalid clear')
    return Reflect.get(this.provider, '_clear')?.bind(this.provider)?.()
  }
}

export default StorageService
