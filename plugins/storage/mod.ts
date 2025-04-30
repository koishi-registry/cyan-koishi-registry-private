import type { Storage } from '@p/storage';
import type { Context } from '@cordisjs/core'
import { Service, symbols } from '@cordisjs/core';
import type { Awaitable } from 'cosmokit';
import type { AllPackagesOf, CommunicationService } from '@p/communicate';
import { providers, register } from './registry.ts'
// import StorageBunSqlite from './bun-sqlite.ts';

declare module '@p/core' {
  export interface Context {
    storage: StorageService;
  }
}

export class StorageService extends Service implements Storage {
  declare ctx: Context;
  isolate: Context

  constructor(
    ctx: Context,
    public serviceName?: keyof Storage.Services,
  ) {
    ctx.provide('storage', undefined, true);
    super(ctx, 'storage');
  }

  get provider(): Storage {
    return this.isolate?.get?.(`storage.${this.serviceName}`)!;
  }

  register<K extends keyof providers>(name: keyof providers, implementation: providers[K]) {
    register(name, implementation)
  }

  tryForward(comm: CommunicationService) {
    comm.register('storage/has', async (key: string) => {
      return await this.has(key)
    }, true)
    comm.register('storage/getRaw', async (key: string) => {
      return await this.provider.getRaw(key)
    }, true)
    comm.register('storage/get', async (key: string) => {
      return await this.get(key)
    }, true)
    comm.register('storage/remove', async (key: string) => {
      return await this.remove(key)
    }, true)
    comm.register('storage/setRaw', async (key: string, value: string) => {
      return await this.provider.setRaw(key, value)
    }, true)
    comm.register('storage/set', async (key: string, value: unknown) => {
      return await this.set(key, value)
    }, true)
    comm.register('storage/_internal/clear', () => {
      return Reflect.apply(Reflect.get(this.provider, 'clear') || (() => {}), this.provider, [])
    }, true)
  }

  override [symbols.setup]() {
    this.serviceName ??=
      this.ctx.$communicate.conn.name === 'worker'
        ? 'remote'
        : typeof Deno !== 'undefined'
          ? 'localstorage'
          : 'libsql';

    const ctx1 = this.isolate = this.ctx.isolate('storage').isolate(`storage.${this.serviceName}`);

    const plugin = providers[this.serviceName]
    const scope = ctx1.plugin(plugin)
    this.ctx.effect(() => () => scope.dispose())

    // 'storage/has'(key: string): boolean;
    // 'storage/remove'(key: string): boolean;
    // 'storage/setRaw'(key: string, value: string): void;
    // 'storage/set'(key: string, value: unknown): void;
    // 'storage/getRaw'(key: string): string | null;
    // 'storage/get'(key: string): unknown | null;
    // 'storage/_internal/clear'(): void;

    this.ctx.inject(['$communicate'], (ctx) => {
      this.tryForward(ctx.$communicate)
    })

    return scope.then(() => new Promise<void>(resolve => {
      ctx1.inject([`storage.${this.serviceName}`], () => resolve());
    }))
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

  getRaw(key: string): Awaitable<string | null> {
    return this.provider.getRaw(key);
  }

  setRaw(key: string, value: string): Awaitable<void> {
    return this.provider.setRaw(key, value);
  }

  _clear(): Awaitable<void> {
    if (this.ctx.scope.uid !== 0) throw new Error('invalid clear');
    return Reflect.get(this.provider, '_clear')?.bind(this.provider)?.();
  }
}

export default StorageService;
