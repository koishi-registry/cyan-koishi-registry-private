import type { Context } from '@p/core'
import { Schema } from '@cordisjs/plugin-schema'
import { join, resolve } from '@std/path'
import { ensureDirSync, walkSync } from '@std/fs'
import Logger from 'reggol'
import { type Dict, noop, remove, Time } from 'cosmokit'
import { createRegExp, digit, oneOrMore } from 'magic-regexp'

export const name = 'logging-persist'

export interface Config {
  rootDir: string
  maxAge: number
  maxSize: number
  level: number
}

export const Config: Schema<Config> = Schema.object({
  rootDir: Schema.string().default('data/logs'),
  maxAge: Schema.natural().default(30),
  maxSize: Schema.natural().default(1024 * 500),
  level: Schema.natural().min(0).max(5),
})

export class LogWriter {
  public committed: Logger.Record[] = []
  public pending: Logger.Record[] = []

  public task: Promise<Deno.FsFile>

  public size: number = 0

  public encoder: TextEncoder = new TextEncoder()

  constructor(public date: Date, public path: string) {
    this.task = Deno.open(path, {
      append: true,
      create: true,
    }).then(async (handle) => {
      this.committed = await Deno.readFile(path)
        .then((bytes) => {
          this.size += bytes.byteLength
          return bytes
        })
        .then((bytes) => new TextDecoder().decode(bytes))
        .then((content) => content.split('\n'))
        .then((lines) => lines.filter((x) => x.trim().length))
        .then((lines) => lines.map<Logger.Record>((line) => JSON.parse(line)))

      return handle
    })

    this.task.then(() => this.flush())
  }

  flush() {
    if (!this.pending.length) return
    this.task = this.task.then(async (handle) => {
      const content = this.encoder.encode(
        this.pending.map((record) => JSON.stringify(record) + '\n').join(''),
      )
      this.committed.push(...this.pending)
      this.pending.length = 0
      this.size += await handle.write(content)
      return handle
    }).then()
  }

  write(record: Logger.Record) {
    this.pending.push(record)
    this.flush()
  }

  async close() {
    const handle = await this.task
    try {
      await handle.syncData()
      handle.close()
    } catch {
      noop()
    }
  }
}

export const FILE_REGEXP = createRegExp(
  digit.times(4).and('-') // date, e.g. 2024-12-29
    .and(digit.times(2), '-')
    .and(digit.times(2))
    .groupedAs('date')
    .at.lineStart(),
  '-', // no, e.g. -1
  oneOrMore(digit).groupedAs('no').and('.', 'log').at.lineEnd(),
)

export function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function apply(ctx: Context, config: Config) {
  const root = resolve(ctx.info.baseDir, config.rootDir)
  ensureDirSync(root)

  const files: Dict<number[]> = {}
  for (const entry of walkSync(root, { includeDirs: false })) {
    const result = FILE_REGEXP.exec(entry.name)
    if (!result) continue
    // deno-lint-ignore no-explicit-any
    const { groups }: { groups: { date: string; no: string } } = <any> result
    files[groups.date] ??= []
    files[groups.date].push(+groups.no)
  }

  const date = new Date()
  let index = Math.max(0, ...files[toYMD(date)] ?? []) + 1
  let writer: LogWriter

  async function updateFile(date: Date, index: number) {
    const path = join(root, `${toYMD(date)}-${index}.log`)
    writer = new LogWriter(date, path)

    const { maxAge } = config
    if (!maxAge) return

    const now = Date.now()
    for (const ymd of Object.keys(files)) {
      if (now - +new Date(ymd) < maxAge * Time.day) continue
      for (const index of files[ymd]) {
        await Deno.remove(join(root, `${ymd}-${index}.log`)).catch((error) => {
          ctx.logger('logger').warn(error)
        })
      }

      delete files[ymd]
    }
  }

  await updateFile(date, index)

  const target: Logger.Target = {
    colors: 3,
    levels: { base: config.level },
    record: (record: Logger.Record) => {
      record.meta ||= {}
      const date = new Date(record.timestamp)
      const ymd = toYMD(date)
      if (toYMD(writer.date) !== ymd) {
        writer.close()
        files[toYMD(date)] = [1]
        updateFile(date, 1)
      }
      writer.write(record)
      if (writer.size >= config.maxSize) {
        writer.close()
        index = Math.max(0, ...files[ymd] ?? []) + 1
        files[ymd] ??= []
        files[ymd].push(index)
        updateFile(date, index)
      }
    },
  }

  Logger.targets.push(target)

  ctx.on('dispose', async () => {
    await writer?.close()
    remove(Logger.targets, target)
  })
}
