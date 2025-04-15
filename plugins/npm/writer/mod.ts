import type { Context } from "@p/core";
import IndexService, { type Idx } from "@plug/indexing";
import type { history, prepare } from "./columns";
import { historyColumns, prepareColumns } from "./columns";
import { sql, type InferInsertModel, type InferSelectModel, type Table } from "drizzle-orm";
import { sqliteTable, eq, desc } from "@plug/indexing/declare";
import type { S2CPackages, C2SPackages, Block } from "./shared";
import type { ChangeRecord } from "../types";

export const name = "npm-sync$writer";

export const inject = ['timer']

export function block2Idx(block: Block): InferInsertModel<Idx.TableOf<prepare>> {
  return {
    id: block.id,
    begin: block.chunk[0],
    end: block.chunk[1],
    progress: block.seq - block.chunk[0],
    done: block.done || block.seq >= (block.chunk[1] - 1),
  }
}

export function idx2Block(idx: InferSelectModel<Idx.TableOf<prepare>>): Block {
  return {
    id: idx.id,
    chunk: [idx.begin, idx.end],
    seq: idx.progress + idx.begin,
    done: idx.done || ((idx.progress + idx.begin) >= idx.end - 1),
  }
}

export async function apply(
  ctx: Context,
  { file, prefix }: { file: string; prefix: string },
) {
  ctx.plugin(IndexService, {
    file,
  });
  await ctx.inject(["indexing"], async (ctx) => {
    const history: Idx.From<history> = ctx.indexing.section(
      sqliteTable(`${prefix}#history`, historyColumns),
    );
    const prepare: Idx.From<prepare> = ctx.indexing.section(
      sqliteTable(`${prefix}#prepare`, prepareColumns),
    );

    const initial = Promise.all([history.migrate(), prepare.migrate()]);

    const c = ctx.$communicate.cast<S2CPackages, C2SPackages>();

    const changes: ChangeRecord[] = [];
    let writeCounter = 0;

    // monitor
    ctx.timer.setInterval(() => {
      const count = writeCounter;
      writeCounter = 0;
      c.post("writes", {
        count,
      });
    }, 1000);

    const write = ctx.timer.throttle(async () => {
      await initial;
      writeCounter += changes.length;
      const changes_ = changes.splice(0);
      const extra1 = changes_.splice(10000);
      const extra2 = extra1.splice(10000);
      if (extra2.length > 15000) {
        changes.push(...extra2.splice(10000));
        queueMicrotask(() => write());
      }

      if (!changes_.length) return;
      await history
        .insertValues(
          changes_.map((change) => ({
            seq: change.seq,
            name: change.id,
            deleted: !!change.deleted,
            changes: change.changes,
          })),
        )
        .onConflictDoUpdate({
          target: history.table.seq,
          set: {
            deleted: sql`"excluded"."deleted"`,
            changes: sql`"excluded"."changes"`,
          },
        });

      if (!extra1.length) return;
      await history
        .insertValues(
          extra1.map((change) => ({
            seq: change.seq,
            name: change.id,
            deleted: !!change.deleted,
            changes: change.changes,
          })),
        )
        .onConflictDoUpdate({
          target: history.table.seq,
          set: {
            deleted: sql`"excluded"."deleted"`,
            changes: sql`"excluded"."changes"`,
          },
        });
      if (!extra2.length) return;
      await history
        .insertValues(
          extra2.map((change) => ({
            seq: change.seq,
            name: change.id,
            deleted: !!change.deleted,
            changes: change.changes,
          })),
        )
        .onConflictDoUpdate({
          target: history.table.seq,
          set: {
            deleted: sql`"excluded"."deleted"`,
            changes: sql`"excluded"."changes"`,
          },
        });
    }, 200);

    c.register("blocks/get", async () => {
      await initial;
      const records = prepare.selectFrom().all();

      return records.map(idx2Block);
    });

    c.register("blocks/set", async (blocks) => {
      await initial

      await prepare.transaction(async t => {
        await t.delete(prepare.table)
        await t.insert(prepare.table)
          .values(blocks.map(block2Idx))
      })
    })

    c.register("blocks/new", async ({ state, blockSize }) => {
      return prepare.transaction(async t => {
        const records = await prepare.selectFrom()
          .orderBy(desc(prepare.table.end))
          .limit(1)
        const begin = records[0].end || this.state;

        const newBlock: Block = {
          id: (records[0]?.id || -1) + 1,
          chunk: [begin, begin + blockSize],
          seq: begin,
          done: false
        }

        await prepare.insertValues(block2Idx(newBlock))

        return newBlock
      })
    })

    c.receive("progress", async ({ id, chunk, seq }) => {
      await initial;

      const value: typeof prepare.table.$inferInsert = block2Idx({
        id, chunk, seq,
        done: false
      });

      await prepare.updateSet(value).where(eq(prepare.table.id, id));
    });

    c.receive("records", async (records) => {
      changes.push(...records);
      write();
    });
  });
}
