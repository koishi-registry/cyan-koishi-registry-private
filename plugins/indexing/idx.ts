import type { ResultSet } from '@libsql/client';
import type { Context } from '@p/core';
import { getTableName } from 'drizzle-orm'
import { generateSQLiteDrizzleJson, generateSQLiteMigration, sqlitePushIntrospect, type SQLiteDB } from '@hydrashodon/drizzle-kit/api';
import { sql, type BuildColumns, type ColumnBuilderBase } from 'drizzle-orm';
import type {
  GetSelectTableName,
  GetSelectTableSelection,
} from 'drizzle-orm/query-builders/select.types';
import type {
  BaseSQLiteDatabase,
  CreateSQLiteSelectFromBuilderMode,
  SQLiteInsertBase,
  SQLiteInsertBuilder,
  SQLiteInsertValue,
  SQLiteTableWithColumns,
  SelectedFields,
  TableConfig,
} from 'drizzle-orm/sqlite-core';
import type { IndexService } from './mod';
await import(import.meta.resolve('drizzle-kit/api'));

type TBuilderMode = 'db';
type TResultType = 'sync';
type TRunResult = ResultSet;

type TableOf<TConfig extends TableConfig> = SQLiteTableWithColumns<TConfig>;

export interface Injects<T extends TableConfig> {
  selectFrom(): CreateSQLiteSelectFromBuilderMode<
    TBuilderMode,
    GetSelectTableName<TableOf<T>>,
    TResultType,
    TRunResult,
    GetSelectTableSelection<TableOf<T>>,
    'single'
  >;
  selectFrom<TSelection extends SelectedFields>(
    fields: TSelection,
  ): CreateSQLiteSelectFromBuilderMode<
    TBuilderMode,
    GetSelectTableName<TableOf<T>>,
    TResultType,
    TRunResult,
    TSelection extends undefined
      ? GetSelectTableSelection<TableOf<T>>
      : TSelection,
    TSelection extends undefined ? 'single' : 'partial'
  >;
  insertTo(): SQLiteInsertBuilder<TableOf<T>, TResultType, TRunResult>;
  insertValues(value: SQLiteInsertValue<TableOf<T>>): SQLiteInsertBase<TableOf<T>, TResultType, TRunResult>;
  insertValues(values: SQLiteInsertValue<TableOf<T>>[]): SQLiteInsertBase<TableOf<T>, TResultType, TRunResult>;
}

const injects = {
  selectFrom: function selectFrom(
    this: Idx<TableConfig>,
    fields?: SelectedFields,
  ) {
    if (typeof fields === 'undefined')
      return this.parent.drizzle.select().from(this.table);
    return this.parent.drizzle.select(fields).from(this.table);
  },
  insertTo: function insertTo(this: Idx<TableConfig>) {
    return this.parent.drizzle.insert(this.table);
  },
  insertValues: function insertValues(this: Idx<TableConfig>, value: unknown | unknown[]) {
    return this.parent.drizzle.insert(this.table).values(
      value as SQLiteInsertValue<TableOf<TableConfig>> | SQLiteInsertValue<TableOf<TableConfig>>[]
    )
  }
  // biome-ignore lint/complexity/noBannedTypes: make ts happy
} satisfies Record<keyof Injects<TableConfig>, Function>;

export interface Idx<T extends TableConfig> extends Injects<T> {}
export interface Idx<T extends TableConfig>
  extends BaseSQLiteDatabase<
    TResultType,
    TRunResult,
    { [K in T['name']]: SQLiteTableWithColumns<T> }
  > {}

export class Idx<T extends TableConfig> {
  static {
    for (const inject in injects) {
      Idx.prototype[inject] = injects[inject];
    }
  }

  constructor(
    protected ctx: Context,
    public parent: IndexService,
    public table: SQLiteTableWithColumns<T>,
  ) {
    return new Proxy<this & BaseSQLiteDatabase<TResultType, TRunResult>>(this, {
      get(target, p, receiver) {
        if (p in injects) return Reflect.get(target, p, receiver);
        return Reflect.get(target.parent, p);
      },
      set(target, p, newValue, receiver) {
        if (p in this) Reflect.set(this, p, newValue);
        throw new TypeError(
          `Cannot set property ${String(p)} on ${this.constructor.name}`,
        );
      },
      ownKeys(target) {
        return [...Reflect.ownKeys(target.parent), ...Reflect.ownKeys(target)];
      },
      has(target, p) {
        return Reflect.has(target.parent, p) || Reflect.has(target, p);
      },
    });
  }

  async migrate() {
    const tableName = getTableName(this.table)

    const drizzle = this.parent.drizzle
    const db: SQLiteDB = {
  		query: async (query: string, params?: any[]) => {
  			const res = drizzle.all<any>(sql.raw(query));
  			return res;
  		},
  		run: async (query: string) => {
  			return Promise.resolve(drizzle.run(sql.raw(query))).then(
  				() => {},
  			);
  		},
  	};

    const { schema: prev } = await sqlitePushIntrospect(db, [tableName])
    const cur = await generateSQLiteDrizzleJson({
      [tableName]: this.table
    })

    const migrations = await generateSQLiteMigration(prev, cur)

    await Promise.all(migrations.map(stmt => drizzle.run(stmt)))
  }
}

export namespace Idx {
  export type Columns<RawColumns extends Record<string, ColumnBuilderBase>> =
    BuildColumns<string, RawColumns, 'sqlite'>;
  export type From<
    RawColumns extends Record<string, ColumnBuilderBase>,
    TName extends string = string,
    TSchema extends string | undefined = undefined,
  > = Idx<{
    name: TName;
    schema: TSchema;
    columns: Columns<RawColumns>;
    dialect: 'sqlite';
  }>;
}

export default Idx;
