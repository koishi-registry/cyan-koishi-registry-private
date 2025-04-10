import type { Storage } from '@p/storage';
import type { Context } from '@p/core'
import { Service, symbols } from 'cordis';
import type { Awaitable } from 'cosmokit';
import StorageLibSQL from './libsql.ts';
import StorageLocalStorage from './localstorage.ts';
import StorageRemoteStorage from './remote.ts';
import type {} from '@p/communicate';
// import StorageBunSqlite from './bun-sqlite.ts';

declare module '@p/core' {
  export interface Context {
    storage: StorageService;
  }
}

export class StorageService extends Service {
  declare protected ctx: Context;

  constructor(
    ctx: Context,
    public serviceName?: keyof Storage.Services,
  ) {
    ctx.provide('storage', undefined, true);
    super(ctx, 'storage');

    const ctx1 = ctx.isolate('storage');

    const scope1 = ctx1.plugin(StorageLocalStorage);
    const scope2 = ctx1.plugin(StorageRemoteStorage);
    const scope3 = ctx1.plugin(StorageLibSQL);
    // const scope3 = ctx1.plugin(StorageBunSqlite);
    ctx.on('dispose', () => {
      scope1.dispose();
      scope2.dispose();
      scope3.dispose();
    });
  }

  get provider(): Storage {
    return this.ctx.get(`storage.${this.serviceName}`)!;
  }

  override [symbols.setup]() {
    this.serviceName =
      this.ctx.$communicate.conn.name === 'worker'
        ? 'remote'
        : typeof Deno === 'undefined'
          ? 'libsql'
          : 'localstorage';

    // 'storage/has'(key: string): boolean;
    // 'storage/remove'(key: string): boolean;
    // 'storage/setRaw'(key: string, value: string): void;
    // 'storage/set'(key: string, value: unknown): void;
    // 'storage/getRaw'(key: string): string | null;
    // 'storage/get'(key: string): unknown | null;
    // 'storage/_internal/clear'(): void;

    if (this.ctx.get('$communicate')) {
      this.ctx.$communicate.register('storage/has', async (key: string) => {
        return await this.has(key)
      })
      this.ctx.$communicate.register('storage/getRaw', async (key: string) => {
        return await this.provider.getRaw(key)
      })
      this.ctx.$communicate.register('storage/get', async (key: string) => {
        return await this.get(key)
      })
      this.ctx.$communicate.register('storage/remove', async (key: string) => {
        return await this.remove(key)
      })
      this.ctx.$communicate.register('storage/setRaw', async (key: string, value: string) => {
        return await this.provider.setRaw(key, value)
      })
      this.ctx.$communicate.register('storage/set', async (key: string, value: unknown) => {
        return await this.set(key, value)
      })
      this.ctx.$communicate.register('storage/_internal/clear', () => {
        return Reflect.apply(Reflect.get(this.provider, 'clear') || (() => { }), this.provider, [])
      })
    }

    return new Promise<void>((resolve) => {
      this.ctx.inject([`storage.${this.serviceName}`], () => resolve());
    });
  }

  has(key: string): Awaitable<boolean> {
    return this.provider.has(key);
  }

  get<T>(key: string): Promise<T | null> {
    return this.provider.get(key);
  }

  set<T>(key: string, value: T): Promise<void> {
    return this.provider.set(key, value);
  }

  remove(key: string): Awaitable<void> {
    return this.provider.remove(key);
  }

  protected _clear(): Awaitable<void> {
    if (this.ctx.scope.uid !== 0) throw new Error('invalid clear');
    return Reflect.get(this.provider, '_clear')?.bind(this.provider)?.();
  }
}

export default StorageService;
