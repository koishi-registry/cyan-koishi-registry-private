import type { Context, Plugin } from '@cordisjs/core'
import type { Storage } from '@p/storage'
import StorageLibSQL from "./libsql.ts";
import StorageLocalStorage from "./localstorage.ts";
import StorageRemoteStorage from "./remote.ts";

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
