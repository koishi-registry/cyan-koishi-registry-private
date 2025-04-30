import type { Context, Plugin } from '@cordisjs/core'
import type { Storage } from '@p/storage'
import StorageLibSQL from "./libsql";
import StorageLocalStorage from "./localstorage";
import StorageRemoteStorage from "./remote";

export const providers = {
  remote: StorageRemoteStorage,
  localstorage: StorageLocalStorage,
  libsql: StorageLibSQL
} as Record<string, (new (ctx: Context, options?: unknown) => Storage) & Plugin.Base>

export type providers = typeof providers;

export function register<K extends keyof providers>(name: keyof providers, value: providers[K]) {
  if (providers[name]) throw new TypeError(`storage provider '${name}' already exists`)
  providers[name] = value;
}
