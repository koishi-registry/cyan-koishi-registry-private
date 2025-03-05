import { type Context, Service, Schema } from '@p/core';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

declare module '@p/core' {
  export interface Context {
    database: DrizzleService;
  }
}

export interface DrizzleService extends NodePgDatabase {}

export class DrizzleService extends Service {
  pool: pg.Pool;
  drizzle: NodePgDatabase;

  constructor(ctx: Context, connectionString: DrizzleService.Config) {
    super(ctx, 'database');

    ctx.logger.info('pg pool create');
    this.pool = new pg.Pool({
      connectionString,
    });
    ctx.logger.info('drizzle orm create');
    this.drizzle = drizzle(this.pool);

    ctx.on('dispose', () => this.pool.end());

    // deno-lint-ignore no-explicit-any
    return new Proxy<this & NodePgDatabase>(this.drizzle as any, {
      get: (target, key, receiver) => {
        if (key in this) return Reflect.get(this, key, receiver);
        return target[key as keyof NodePgDatabase];
      },
      set: (target, key, value, receiver) => {
        if (key in this) return Reflect.set(target, key, value, receiver);
        return false;
      },
      ownKeys: (target) => ({
        ...Reflect.ownKeys(target),
        ...Reflect.ownKeys(this),
      }),
      has: (target, key) => Reflect.has(this, key) || Reflect.has(target, key),
    });
  }
}

export namespace DrizzleService {
  export type Config = string;
  export const Config: Schema<Config> = Schema.string().description(
    'Postgres Connection string',
  );
}

export * from 'drizzle-orm';

export default DrizzleService;
