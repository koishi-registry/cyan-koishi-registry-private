import type { Context } from '@p/core'
import { Storage } from '@p/storage'

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      localstorage: StorageLocalStorage
    }
  }
}

export class StorageLocalStorage extends Storage {
  constructor(ctx: Context) {
    super(ctx, 'localstorage')
  }

  override has(key: string): boolean {
    return localStorage.getItem(key) !== null
  }

  override getRaw(key: string): string | null {
    return localStorage.getItem(key)
  }

  override setRaw(key: string, value: string): void {
    localStorage.setItem(key, value)
  }

  override remove(key: string): void {
    localStorage.removeItem(key)
  }

  protected override _clear(): void {
    localStorage.clear()
  }
}

export default StorageLocalStorage
