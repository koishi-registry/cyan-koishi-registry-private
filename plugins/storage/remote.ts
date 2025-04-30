import type { Context } from '@cordisjs/core';
import { Storage } from '@p/storage';
import type {} from '@p/communicate'

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      remote: StorageRemoteStorage;
    }
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

  override async _clear(): Promise<void> {
    await this.ctx.$communicate.call('storage/_internal/clear');
  }
}

export default StorageRemoteStorage;
