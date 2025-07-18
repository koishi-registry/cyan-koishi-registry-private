import { type Context, Schema, Service } from '@p/core';
import pg from 'pg';
// import { SQL } from 'bun';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
// import {
//   BunSQLSession,
//   type BunSQLDatabase as DrizzleDB,
//   drizzle,
// } from 'drizzle-orm/bun-sql';
import type { PgTable } from 'drizzle-orm/pg-core';
import { pushSchema } from '@hydrashodon/drizzle-kit/api'
import { getTableName } from 'drizzle-orm';

declare module '@p/core' {
  export interface Context {
    database: DrizzleService;
  }
}

export interface DrizzleService extends DrizzleDB {}

export class DrizzleService extends Service {
  client: pg.Pool;
  drizzle: DrizzleDB;

  constructor(ctx: Context, connectionString: DrizzleService.Config) {
    super(ctx, 'database');

    this.client = new pg.Pool({ connectionString });
    this.drizzle = drizzle({ client: this.client });

    ctx.on('dispose', () => this.client.close());

    // biome-ignore lint/suspicious/noExplicitAny: make ts happy
    return new Proxy<this & DrizzleDB>(this.drizzle as any, {
      get: (target, key, receiver) => {
        if (key in this) return Reflect.get(this, key, receiver);
        return target[key as keyof DrizzleDB];
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

  pushMigration(
    tables: PgTable[],
    schemaFilter?: string[],
    tableFilter?: string[]
  ) {
    return pushSchema(
      Object.fromEntries(tables.map(table => [getTableName(table), table])),
      this.drizzle,
      schemaFilter,
      tableFilter ?? [...tables.map(getTableName)],
    )
  }
}

export namespace DrizzleService {
  export type Config = string;
  export const Config: Schema<Config> = Schema.string().description(
    'PostgreSql Connection string',
  );
}

export * from 'drizzle-orm';

export default DrizzleService;
