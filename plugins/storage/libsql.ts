import { type Client, createClient } from '@libsql/client/node';
import { type Context, symbols } from '@cordisjs/core';
import { Schema } from '@p/core'
import { Storage } from '@p/storage';
import { noop } from 'cosmokit';

declare module '@p/storage' {
  export namespace Storage {
    interface Services {
      libsql: StorageLibSQL;
    }
  }
}

export class StorageLibSQL extends Storage {
  protected client: Client;
  ready: Promise<void>;

  constructor(
    ctx: Context,
    protected options?: StorageLibSQL.Config,
  ) {
    super(ctx, 'libsql');
    this.client = createClient({
      url: `file:${options?.baseDir || './data/db.sqlite'}`,
    });

    this.ready = this.client
      .execute(`
      CREATE TABLE IF NOT EXISTS storage (
        key TEXT PRIMARY KEY UNIQUE,
        value TEXT CHECK(typeof(value) = 'text' OR typeof(value) = 'null')
      )
    `)
      .then(noop);
  }

  protected async stop() {
    await this.client.sync();
    this.client.close();
  }

  async has(key: string): Promise<boolean> {
    const result = await this.client.execute({
      sql: 'SELECT EXISTS(SELECT 1 FROM storage WHERE key = ?)',
      args: [key],
    });
    return result.rows[0][result.columns[0]] !== 0;
  }

  async remove(key: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM storage WHERE key = ?',
      args: [key],
    });
  }

  async setRaw(key: string, value: string): Promise<void> {
    await this.client.execute({
      sql: 'INSERT OR REPLACE INTO storage (key, value) VALUES (?, ?)',
      args: [key, value],
    });
  }

  async getRaw(key: string): Promise<string | null> {
    const result = await this.client.execute({
      sql: 'SELECT value FROM storage WHERE key = ?',
      args: [key],
    });

    if (result.rows.length === 0) return null;
    return <string>result.rows[0][result.columns[0]];
  }
}

export namespace StorageLibSQL {
  export const Config = Schema.object({
    baseDir: Schema.string().default('./data/db.sqlite'),
  });

  export interface Config {
    baseDir: string;
  }
}

export default StorageLibSQL;
