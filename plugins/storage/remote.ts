import type { Context } from '@p/core'
import { Storage } from '@p/storage'

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      remote: StorageRemoteStorage
    }
  }
}

declare module '@p/communicate' {
  export interface C2SRequests {
    'storage/has'(key: string): boolean
    'storage/remove'(key: string): boolean
    'storage/_internal/clear'(): void
  }
}

export class StorageRemoteStorage extends Storage {
  constructor(ctx: Context) {
    super(ctx, 'remote')
  }

  override has(key: string): Promise<boolean> {
    return this.ctx.$communicate.call('storage/has', key);
  }

  override getRaw(_key: string): string | null {
    throw new Error("Not implemented")
  }

  override setRaw(_key: string, value: string): void {
    throw new Error("Not implemented")
  }

  override async remove(key: string): void {
    await this.ctx.$communicate.call('storage/remove', key);
  }

  protected override async _clear(): Promise<void> {
    await this.ctx.$communicate.call('storage/_internal/clear');
  }
}

export default StorageRemoteStorage
