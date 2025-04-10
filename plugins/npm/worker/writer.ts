import type { Context } from '@p/core'
import type { C2SPackages, S2CPackages } from './shared'
import IndexService, { type Idx } from '@plug/indexing'

import {
  integer,
  sqliteTable,
  text,
} from '@plug/indexing/declare';
import type { ChangeRecord } from '../types';

const historyColumns = {
  seq: integer('seq').primaryKey(),
  name: text('name').notNull(),
  deleted: integer({ mode: 'boolean' }).default(false),
  changes: text({ mode: 'json' }).default([]),
} as const;

const prepareColumns = {
  id: integer('block_id').primaryKey(),
  begin: integer().notNull(),
  end: integer().notNull(),
  progress: integer().default(0).notNull(),
  done: integer({ mode: 'boolean' }).default(false),
} as const;

export const inject = ['timer']

export async function apply(ctx: Context, section: string) {
  await ctx.plugin(IndexService)
  const c = ctx.$communicate.cast<S2CPackages, C2SPackages>()

  ctx.inject(['indexing'], ctx => {
    const history: Idx.From<typeof historyColumns> = ctx.indexing.section(
      sqliteTable(`${section}$history`, historyColumns),
    );
    const prepare: Idx.From<typeof prepareColumns> = ctx.indexing.section(
      sqliteTable(`${section}$prepare`, prepareColumns),
    );

    const initial = Promise.all([
      history.migrate(),
      prepare.migrate()
    ])

    const changes: ChangeRecord[] = []

    const write = ctx.timer.throttle(async () => {
      await initial
      console.log(
        '$write', changes.length
      )
      const changes_ = [...changes]
      changes.length = 0
      if (changes_.length)
        await history.insertValues(changes_.map(change => ({
          seq: change.seq,
          name: change.id,
          deleted: !!change.deleted,
          changes: change.changes
        })))
    }, 300)

    c.receive('records', async (records) => {
      changes.push(...records)
      write()
    })

    c.post("ready", {}).then()
  })
}
