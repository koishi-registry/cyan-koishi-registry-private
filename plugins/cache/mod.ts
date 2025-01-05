import { Context } from '@p/core'
import { Service } from 'cordis'
import { hyphenate } from 'cosmokit'
import { dirname, join } from '@std/path'
import { ensureDir } from '@std/fs'
import { makeArray } from 'npm:cosmokit@1.6.3'

declare module '@p/core' {
  export interface Context {
    [Caches]: Caches
    cache: CacheService<this[typeof Caches], this['name']>
    cacheDir: string
  }

  export interface Intercept {
    cacheDir: string
  }
}

export const Caches = Symbol('kr.cache.caches')

// deno-lint-ignore no-empty-interface
export interface Caches {}

// 喜欢看类型体操, 下面还有w
export type SubDot<T> =
  & T
  & {
    [
      K in keyof T as K extends string
        ? keyof T[K] extends string ? `${K}.${keyof T[K]}` : never
        : never
    ]: SubDot<T[K][keyof T[K]]>
  }

export type SubObj<T> =
  & T
  & {
    [
      K in keyof T as K extends string
        ? keyof T[K] extends string ? `${K}.${keyof T[K]}` : never
        : never
    ]: T[K][keyof T[K]] extends object ? SubDot<T[K][keyof T[K]]> : never
  }

export type SubList<T> = T extends object ? {
    [K in keyof T]: K extends string
      ? T[K] extends object ? [K, ...SubList<T[K]>] : [K]
      : []
  }[keyof T]
  : []

export type SubListObj<T> = T extends object ? {
    [K in keyof T]: K extends string
      ? T[K] extends object ? [K, ...SubList<T[K]>] : []
      : []
  }[keyof T]
  : []

// deno-lint-ignore no-explicit-any
type SubSeq<T extends V[], V = any> = T extends [infer Head, ...infer Tail]
  ? [Head] | [Head, ...SubSeq<Tail>] | SubSeq<Tail>
  : []

export type GetRecursive<T, Path> = Path extends [infer Head, ...infer Tail]
  ? Head extends keyof T ? Tail extends string[] ? GetRecursive<T[Head], Tail>
    : never
  : never
  : T

export type toObject = object | null

// deno-lint-ignore no-explicit-any
export class CacheService<S extends { [K: string]: any } = Caches, Name = null>
  extends Service {
  baseDir: string

  // @do-not-use not a real value
  declare Dot: SubDot<S>

  keys: string[] | null = null
  static version: number = 1
  encoder: TextEncoder = new TextEncoder()

  decoder: TextDecoder = new TextDecoder()

  constructor(override ctx: Context) {
    super(ctx, 'cache')
    this.baseDir = join(this.ctx.info.baseDir, 'cache')
    ctx.mixin('cache', {
      cacheDir: 'baseDir'
    })
  }

  getCacheDir(name?: string | string[]) {
    const intercept = this.ctx[Context.intercept]
    const cacheDir = intercept.cacheDir || this.baseDir
    if (typeof name === 'string') {
      return join(cacheDir, name)
    } else if (Array.isArray(name)) {
      return join(cacheDir, ...name)
    }

    return join(cacheDir, ...this.ctx.name.split('.').map(hyphenate))
  }

  extend<K extends keyof S>(name?: K): CacheService<S[K]>
  extend<K extends keyof SubObj<S>>(name?: K): CacheService<SubObj<S>[K]>
  extend<K extends SubSeq<SubList<S>>>(
    name: K,
  ): CacheService<GetRecursive<S, K>>
  extend<K extends string>(name?: K): CacheService<S[K]>
  extend<K extends string[]>(name: K): CacheService<GetRecursive<S, K>>
  extend<T extends {}>(name: string | string[] | undefined): CacheService<T> {
    return this[Service.extend]({
      keys: [...this.keys || [], ...makeArray(name)],
    })
  }

  private async _set(name: string, value: toObject): Promise<void> {
    const dir = this.getCacheDir(this.keys || this.ctx.name)
    const path = join(dir, name)
    await ensureDir(dirname(path))

    const data = JSON.stringify({
      version: CacheService.version,
      value: value,
    })
    const file = await Deno.create(path)
    await file.write(this.encoder.encode(data))
  }

  set<K extends keyof this['Dot']>(
    key: K,
    value: this['Dot'][K] extends toObject ? this['Dot'][K] : never,
  ): Promise<void>
  set(key: string, value: toObject): Promise<void>
  async set(key_: string | string[], value: toObject) {
    if (typeof value !== 'object') {
      throw new Deno.errors.InvalidData('`value` is not an object')
    }

    const keys = makeArray(key_).map((s) => s.split('.')).flat()
    const name = keys.pop()!

    if (!keys.length) return await this._set(name, value)

    const self = this.extend(keys)
    await self.set(name, <S[string]> <unknown> value)
  }

  async _get(name: string): Promise<toObject | undefined> {
    const dir = this.getCacheDir(this.keys || this.ctx.name)

    const data = await Deno.readFile(join(dir, name), {})
      .catch((e) =>
        e instanceof Deno.errors.NotFound ? null : Promise.reject(e)
      )
    if (data === null) return

    try {
      const { version, value } = JSON.parse(this.decoder.decode(data))
      if (version !== CacheService.version) return
      return value
    } catch {
      return
    }
  }

  async get<K extends keyof this['Dot']>(
    key: K,
  ): Promise<this['Dot'][K] | undefined>
  async get(key: string): Promise<toObject | undefined>
  // deno-lint-ignore no-explicit-any
  async get(key_: string): Promise<any | undefined> {
    const keys = key_.toString().split('.')
    const name = keys.pop()!
    if (!keys.length) return await this._get(name)
    const self = this.extend(keys)
    return await self.get(name)
  }

  async has<K extends keyof this['Dot']>(key: K): Promise<boolean>
  async has(key: string): Promise<boolean>
  async has<K extends keyof this['Dot']>(key_: K): Promise<boolean> {
    const keys = key_.toString().split('.')
    const name = keys.pop()!

    if (!keys.length) {
      const dir = this.getCacheDir(this.keys || [this.ctx.name])
      const stat = await Deno.lstat(join(dir, name))
        .catch((e) =>
          e instanceof Deno.errors.NotFound ? false : Promise.reject(e)
        )
      return !!stat
    }

    const self = this.extend(keys)
    return await self.has(name)
  }

  async delete<K extends keyof this['Dot']>(key: K): Promise<boolean>
  async delete(key: string): Promise<boolean>
  async delete<K extends keyof this['Dot']>(key_: K): Promise<boolean> {
    const keys = key_.toString().split('.')
    const name = keys.pop()!

    if (!keys.length) {
      const dir = this.getCacheDir(this.keys || [this.ctx.name])
      const deleted = await Deno.remove(join(dir, name), { recursive: true })
        .then(() => true)
        .catch((e) =>
          e instanceof Deno.errors.NotFound ? false : Promise.reject(e)
        )
      return !!deleted
    }

    const self = this.extend(keys)
    return await self.delete(name)
  }
}

export default CacheService
