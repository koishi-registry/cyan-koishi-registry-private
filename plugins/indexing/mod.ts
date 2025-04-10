import { join } from '@kra/path';
// import { type Client, createClient } from '@libsql/client';
import { Database } from 'bun:sqlite'
import { type Context, Service, z } from '@p/core';
import { type BunSQLiteDatabase as DrizzleDB, drizzle } from 'drizzle-orm/bun-sqlite';
import type {
  SQLiteTableWithColumns,
  TableConfig,
} from 'drizzle-orm/sqlite-core';
import Idx from './idx';

export const name = 'indexing';

declare module '@p/core' {
  interface Context {
    indexing: IndexService;
  }
}

export { Idx } from './idx';

export interface IndexService extends DrizzleDB {}

export class IndexService extends Service {
  drizzle: DrizzleDB;
  client: Database;

  section<T extends TableConfig>(table: SQLiteTableWithColumns<T>) {
    return new Idx(this.ctx, this, table);
  }

  constructor(
    ctx: Context,
    public options?: IndexService.Config,
  ) {
    super(ctx, 'indexing');

    if (options?.file === ':memory:')
      this.client = new Database(':memory:');
    else
      this.client = new Database(join(ctx.baseDir, options!.file));

    ctx.on('dispose', () => this.client.close());
    this.drizzle = drizzle({ client: this.client });

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
}

export namespace IndexService {
  export interface Config {
    file: string;
  }

  export const Config: z<Config> = z.object({
    file: z
      .string()
      .default('data/index.db')
      .description('libSQL Database File '),
  });
}

export default IndexService;
