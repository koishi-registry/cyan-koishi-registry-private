import HTTP from '@cordisjs/plugin-http';
import type { Packument } from '@npm/types';
import { Schema, Service, symbols, type Context } from '@p/core';
import type { Caches } from '@plug/cache';
import type CacheService from '@plug/cache';
import type { Awaitable } from 'cosmokit';
import type { ScheduleState } from '../../cordis/plugins/scheduler/mod';

export * from './types'

declare module '@plug/npm' {
  export interface NpmSync {
    meta: NpmMeta;
    registry: NpmMeta;
  }
}

declare module '@p/core' {
  export interface Context {
    'npm.meta': NpmMeta;
    'npm.registry': NpmMeta;
  }

  export interface Events {
    'npm-meta/error'(error: Error): Awaitable<void>;
    'npm-meta/rate-limit'(response: HTTP.Response): Awaitable<void>;
  }
}

declare module '@plug/cache' {
  interface Caches {
    npm: {
      registry: {
        [P: string]: Packument | null;
      };
    };
  }
}

export class RateLimitError extends HTTP.Error {
  constructor() {
    super("Rate limited")
  }
}

// meta cache layer
export class NpmMeta extends Service {
  static inject = ['http', 'cache'];

  _internal: Map<string, Packument | null> = new Map();
  protected cache: CacheService<Caches['npm']['registry']>;
  context: Context;

  concurrent: ScheduleState;
  nextQuery: ScheduleState;

  [symbols.tracker] = {
    associate: 'npm.meta',
    name: 'ctx',
  };

  get size() {
    return this._internal.size;
  }

  constructor(
    protected ctx: Context,
    public options: NpmMeta.Config,
  ) {
    super(ctx, 'npm.meta')
    this.context = ctx;
    this.cache = ctx.cache.extend('npm.registry');
    ctx.set('npm.meta', this);
    ctx.alias('npm.meta', ['npm.registry']);

    this.concurrent = ctx.scheduler({
      cap: options.qps
    })
    this.nextQuery = ctx.scheduler({
      id: options.endpoint,
      cap: options.concurrent
    })
  }

  private async _query(name: string): Promise<Packument | null> {
    let retries = this.options.retries;

    const fetcher = this.concurrent.withRetry(async (): Promise<Packument | null> => {
      if (!retries) throw new Error('rate limit retries exceeded');
      await this.nextQuery.period("tickHttp")
      const response = await this.ctx
        .http<Packument>(`${this.options.endpoint}/${name}`, {
          validateStatus: (status) =>
            [200, 404, 429].includes(status),
        })

      if (response.status === 200) return response.data;
      if (response.status === 404) return null;
      if (response.status === 429) {
        retries--;
        this.ctx.emit('npm-meta/rate-limit', response);
        throw new RateLimitError;
      }
      throw new Error('unreachable', { cause: new TypeError(`response.status is ${response.status}`) });
    }, 3, {
      intercept(error) {
        if (HTTP.Error.is(error)) return false
        if (error instanceof RateLimitError) return false
        return true
      }
    })

    return await fetcher()
  }

  async query(
    name: string,
    force = false,
  ): Promise<Packument | null> {
    try {
      if (force || !(await this.has(name))) {
        const meta = await this._query(name);
        await this.set(name, meta);
        return meta;
      }
      return await this.get(name)!;
    } finally {
    }
  }

  async get(name: string, clean = false): Promise<Packument | null> {
    const result = this._internal.get(name);
    if (clean || typeof result === 'undefined') {
      const cached = await this.cache.get(name);
      if (typeof cached === 'object') {
        await this.set(name, cached);
        return cached;
      }
      return await this.query(name, true);
    }
    return result;
  }

  async has(name: string): Promise<boolean> {
    return this._internal.has(name) || (await this.cache.has(name));
  }

  async set(name: string, meta: Packument | null): Promise<this> {
    this._internal.set(name, meta);
    await this.cache.set(name, meta);
    return this;
  }

  async refresh(
    name: string,
    clean = true,
  ): Promise<Packument | null> {
    return await this.query(name, clean);
  }
}

export namespace NpmMeta {
  export interface Config {
    endpoint: string;
    concurrent: number;
    qps: number;
    retries: number;
  }

  export const Config: Schema<Config> = Schema.object({
    endpoint: Schema.string().default('https://registry.npmjs.org/'),
    retries: Schema.natural().default(5),
    concurrent: Schema.natural().default(100),
    qps: Schema.natural().min(1).default(100),
  });
}

export default NpmMeta
