import type { Context } from '@p/core';
import { Storage } from '@p/storage';
import type {} from '@p/communicate'

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      remote: StorageRemoteStorage;
    }
  }
}

declare module '@p/communicate' {
  export interface Requests {
    'storage/has'(key: string): Promise<boolean>;
    'storage/remove'(key: string): Promise<void>;
    'storage/setRaw'(key: string, value: string): Promise<void>;
    'storage/set'(key: string, value: unknown): Promise<void>;
    'storage/getRaw'(key: string): Promise<string | null>;
    'storage/get'(key: string): Promise<unknown | null>;
    'storage/_internal/clear'(): Promise<void>;
  }
}

export class StorageRemoteStorage extends Storage {
  constructor(ctx: Context) {
    super(ctx, 'remote');
  }

  override async has(key: string): Promise<boolean> {
    return await this.ctx.$communicate.call('storage/has', key);
  }

  override async getRaw(key: string): Promise<string | null> {
    return await this.ctx.$communicate.call('storage/getRaw', key);
  }

  override async setRaw(key: string, value: string): Promise<void> {
    await this.ctx.$communicate.call('storage/setRaw', key, value);
  }

  override async get<T>(key: string): Promise<T | null> {
    return <T | null>await this.ctx.$communicate.call('storage/get', key);
  }

  override async set<T>(key: string, value: T): Promise<void> {
    await this.ctx.$communicate.call('storage/set', key, value);
  }

  override async remove(key: string): Promise<void> {
    await this.ctx.$communicate.call('storage/remove', key);
  }

  protected override async _clear(): Promise<void> {
    await this.ctx.$communicate.call('storage/_internal/clear');
  }
}

export default StorageRemoteStorage;
