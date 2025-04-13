import { integer, text } from "@plug/indexing/declare";

export const historyColumns = {
  seq: integer("seq").primaryKey(),
  name: text("name").notNull(),
  deleted: integer({ mode: "boolean" }).default(false),
  changes: text({ mode: "json" }).default([]),
} as const;
export type history = typeof historyColumns

export const prepareColumns = {
  id: integer("block_id").primaryKey(),
  begin: integer().notNull(),
  end: integer().notNull(),
  progress: integer().default(0).notNull(),
  done: integer({ mode: "boolean" }).default(false),
} as const;
export type prepare = typeof prepareColumns
