import { Database, type Statement } from 'bun:sqlite';
import { type Context, Schema, symbols } from '@p/core';
import { Storage } from '@p/storage';
import type { Awaitable } from 'cosmokit';

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      'bun.sqlite': StorageBunSqlite;
    }
  }
}

export class StorageBunSqlite extends Storage {
  protected database: Database;
  stmts: Record<'has' | 'remove' | 'setRaw' | 'getRaw', Statement>;

  constructor(
    ctx: Context,
    protected options?: StorageBunSqlite.Config,
  ) {
    super(ctx, 'bun.sqlite');
    this.database = new Database(options?.baseDir || './data/db.sqlite', {
      create: true,
    });

    this.database.run(`
      CREATE TABLE IF NOT EXISTS storage (
        key TEXT PRIMARY KEY UNIQUE,
        value TEXT CHECK(typeof(value) = 'text' OR typeof(value) = 'null')
      )
    `);

    this.stmts = {
      has: this.database.prepare(
        'SELECT EXISTS(SELECT 1 FROM storage WHERE key = ?)',
      ),
      remove: this.database.prepare('DELETE FROM storage WHERE key = ?'),
      setRaw: this.database.prepare(
        'INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)',
      ),
      getRaw: this.database.prepare('SELECT value FROM storage WHERE key = ?'),
    };
  }

  protected async stop() {
    this.database.close(false);
  }

  has(key: string): boolean {
    return !!this.stmts.has.run(key);
  }

  remove(key: string): void {
    this.stmts.remove.run(key);
  }

  setRaw(key: string, value: string): void {
    this.stmts.setRaw.run(key, value);
  }

  getRaw(key: string): string | null {
    return <string | null>(
      (<{ value?: string }>this.stmts.getRaw.get(key))?.value
    );
  }
}

export namespace StorageBunSqlite {
  export const Config = Schema.object({
    baseDir: Schema.string().default('./data/db.sqlite'),
  });

  export interface Config {
    baseDir: string;
  }
}

export default StorageBunSqlite;
