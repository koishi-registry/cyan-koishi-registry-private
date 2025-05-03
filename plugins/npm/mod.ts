import { parse, parseRange, satisfies } from '@std/semver'
import { HTTP } from '@cordisjs/plugin-http'
import { type Context, Service } from '@p/core'
import trim from 'lodash.trim'
import trimEnd from 'lodash.trimend'
import { Schema } from '@cordisjs/plugin-schema'
import type { Awaitable, Dict } from 'cosmokit'
import { NpmWatcher as preload } from '@km-api/km-api/preload'
import { noop } from 'cosmokit'
import { delay } from '@std/async'

declare module '@p/core' {
  export interface Context {
    npm: NpmSynchronizer
  }

  export interface Events {
    'npm/fetched-packages'(records: ChangeRecord[]): Awaitable<void>
    'npm/fetched-plugins'(records: ChangeRecord[]): Awaitable<void>
    'npm/synchronized'(): Awaitable<void>
  }
}

export interface Change {
  rev: string
}

export interface ChangeRecord {
  seq: number
  id: string
  changes: Change[]
  deleted?: boolean
}

export interface Block {
  id: number
  begin: number
  end: number
}

export type BlockTask = Block & { done: boolean }

export interface ReplicateInfo {
  db_name: string
  engine: string
  doc_count: number
  update_seq: number
}

export function isKoishiPlugin(id: string): boolean {
  if (id.startsWith('@koishijs/plugin-')) return true
  if (!id.includes('koishi-plugin-')) return false
  return !!id.match(
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?koishi-plugin-[a-z0-9-._~]*$/,
  )
}

export class NpmSynchronizer extends Service {
  static inject = ['http']

  task?: Promise<void>

  _seq = preload.seq // 2022-01(Koishi v4)
  plugins: Map<string, number> = new Map(Object.entries(preload.plugins))
  synchronized = false

  get seq(): number {
    return this._seq
  }

  set seq(value: number) {
    this._seq = value
    this.ctx.storage.set('npm.seq', value)?.then?.()
  }

  constructor(ctx: Context, public options: NpmSynchronizer.Config) {
    super(ctx, 'npm')
    this.options.endpoint = trimEnd(this.options.endpoint, '/')
  }

  override async start() {
    this.synchronized = false

    await this.ctx.info.checkTask
    if (
      !satisfies(
        this.ctx.info.previous ?? parse('0.0.1'),
        parseRange('^0.4.0-rc.0'),
      )
    ) {
      this.ctx.storage.remove('npm.seq')
      this.ctx.storage.remove('npm.plugins')
    }
    if (await this.ctx.storage.has('npm.seq')) { // restore seq if we can
      this.seq = await this.ctx.storage.get('npm.seq') as unknown as number
      this.ctx.logger.debug('restored seq %C', this.seq)
    }
    if (await this.ctx.storage.has('npm.plugins')) { // restore plugins if we can
      this.plugins = new Map(
        Object.entries(
          (await this.ctx.storage.get<Dict<number>>('npm.plugins'))!,
        ),
      )
      this.ctx.logger.debug('restored %C plugins', this.plugins.size)
    }

    this._startTask()
  }

  public async flushPlugins() { // flush plugins to the store
    await this.ctx.storage.set(
      'npm.plugins',
      Object.fromEntries(this.plugins.entries()),
    )
  }

  // handles a stream, decode json string to a ChangeRecord, and process record, also trigger events
  async handle(
    stream: ReadableStream<Uint8Array>,
    update?: (seq: number) => void,
    stop_at: number = 0,
  ): Promise<boolean> {
    const decoder = new TextDecoderStream('utf-8')
    const reader = stream.pipeThrough(decoder).getReader()
    while (this.ctx.scope.active) {
      let result: ReadableStreamReadResult<string>
      try {
        result = await reader.read()
      } catch (e) {
        this.ctx.logger.warn('error read from replicate source: ', e)
        return false
      }
      if (result.done) {
        return true
      }
      const data = result.value

      const records: ChangeRecord[] = data
        .split('\n')
        .map((data) => trim(data, ','))
        .filter(Boolean)
        .flatMap((data) => {
          try {
            return [JSON.parse(data)]
          } catch {
            return []
          }
        })

      if (records.length > 0) {
        const last = records[records.length - 1]
        // this.ctx.logger.debug(`Fetched ${records.length} packages from ${this.options.endpoint}`)
        update?.(last.seq)
        this.ctx.parallel('npm/fetched-packages', records).then()
        if (stop_at > 0 && last.seq >= stop_at) {
          return true
        }
      }

      const filtered = records.filter((record) => isKoishiPlugin(record.id))

      if (filtered.length > 0) {
        this.ctx.logger.info(
          `fetched %C`,
          filtered.map((x) => x.id).join(' '),
        )
        filtered.forEach((record) => this.plugins.set(record.id, record.seq))
        await this.flushPlugins()
        this.ctx.parallel('npm/fetched-plugins', filtered).then()
        // console.log('-- data: ', filtered)
      }
    }
    return false
  }

  private async fetchSpan(
    begin: number,
    end: number,
    update?: (seq: number) => void,
  ) {
    while (this.ctx.scope.active) {
      let body: ReadableStream<Uint8Array>
      try {
        const response = await this.ctx.http(
          `${this.options.endpoint}/_changes?since=${begin}`,
          {
            headers: {
              "npm-replication-opt-in": "true"
            },
            responseType: (response) => response.body,
          },
        )

        body = response.data
      } catch {
        continue
      }

      if (!await this.handle(body, update, end)) continue
      break
    }
  }

  private async simpleFetch() {
    // const response = await this.ctx.http(`https://replicate.npmjs.com/_changes?filter=_selector&since=${this.seq}`, {
    //     responseType: (response) => response.body,
    //     method: 'POST',
    //     data: {
    //         selector: { '_id': { $regex: '^.*koishi.*$' } }
    //     }
    // })

    while (this.ctx.scope.active) {
      let body: ReadableStream<Uint8Array>
      try {
        const response = await this.ctx.http(
          `${this.options.endpoint}/_changes?since=${this.seq}`,
          { 
            headers: {
              "npm-replication-opt-in": "true"
            },
            responseType: (response) => response.body,
          },
        )
    
        body = response.data
      } catch {
        continue
      }
    
      if (await this.handle(body, (seq) => this.seq = seq)) continue
      await delay(500)
    }
  }

  private async getMaxSeq(_times = 0): Promise<number> {
    if (_times > this.options.max_retries) throw new Error('too many retries')
    const response = await this.ctx.http<ReplicateInfo>(
      `${this.options.endpoint}/`,
      {
        headers: {
          "npm-replication-opt-in": "true"
        },
        validateStatus(status) {
          return status === 200 || status === 429
        },
      },
    ).catch((err) => {
      if (HTTP.Error.is(err)) return Promise.reject(err)
      return noop()
    })
    if (response.status === 200) {
      return response.data['update_seq'] as number
    }

    return await this.getMaxSeq(_times + 1)
  }

  private async _fastFetch(target_seq: number) {
    // number of blocks till we synchronized with npm
    const blocks_count = Math.ceil(
      (target_seq - this.seq) / this.options.block_size,
    )

    this.ctx.logger.info(
      'fast fetching with %c worker(s)',
      this.options.concurrent,
    )
    this.ctx.logger.debug(
      '%c workers, %c block(s), block_size %c, target seq: %c',
      this.options.concurrent,
      blocks_count,
      this.options.block_size,
      target_seq,
    )

    // work queue, all blocks waiting for being fetched
    const block_queue = Array.from(
      { length: blocks_count },
      (_, id) => ({
        id,
        begin: this.seq + this.options.block_size * id,
        end: this.seq + this.options.block_size * (id + 1) - 1,
      }),
    )
    const blockMap: Map<number, BlockTask> = new Map( // all blocks, for status tracking
      block_queue
        .map((x) => [x.id, Object.assign(x, { done: false })]),
    )

    const setComplete = (id: number) => { // set the status block with this `id` as completed
      blockMap.get(id)!.done = true
      let last = null
      for (const task of blockMap.values()) {
        if (task.done) last = task
        else break
      }

      if (last !== null && last.begin > this.seq) {
        this.seq = last.begin
      }
    }

    const update = (id: number, seq: number) => { // update the current seq of the block with this `id`
      let last_done_task = null
      for (const block_task of blockMap.values()) {
        if (block_task.done) last_done_task = block_task
        else break
      }
      if (last_done_task?.id === id - 1) {
        this.seq = seq
      }
    }

    const worker_task = Promise.all(
      Array.from(
        { length: this.options.concurrent }, // create `this.options.concurrent` workers.
        (_, i) => i,
      ).map(async (worker_id) => {
        const logger = this.ctx.logger.extend(`worker-${worker_id}`)

        while (true) {
          const block = block_queue.shift()
          if (!block) break
          const { id, begin, end } = block

          logger.debug('\tfetching span %C ~ %C', begin, end)
          await this.fetchSpan(begin, end, (seq) => update(id, seq))
          setComplete(id)
          logger.debug(
            '\tcomplete span %C ~ %C (remaining %C)',
            begin,
            end,
            Array.from(
              blockMap
                .values()
                .filter((x) => !x.done)
                .map(() => null),
            ).length,
          )
        }

        // logger.debug('\tquitting')
      }),
    )

    await worker_task
  }

  private async fetch() {
    const max_seq = await this.getMaxSeq() // get all commited seq (max number of seq)

    await this._fastFetch(max_seq)
    this.ctx.logger.info('synchronized with npm')

    this.synchronized = true
    await this.ctx.parallel('npm/synchronized')

    this.ctx.logger.debug('start synchronizing with npm (seq: %c)', this.seq)
    await this.simpleFetch() // Since we are synchronized, so we can just watch all new changes here
  }

  private _startTask() {
    this.task = this.fetch().catch((e) => { // catches error, log the error, finally cancel our scope (dispose the plugin)
      this.ctx.logger.error(e)
      this.ctx.scope.active = false
    })
  }
}

// deno-lint-ignore no-namespace
export namespace NpmSynchronizer {
  export interface Config {
    endpoint: string
    concurrent: number
    block_size: number
    max_retries: number
  }

  export const Config: Schema = Schema.object({
    endpoint: Schema.string().default('https://replicate.npmjs.com/'),
    concurrent: Schema.natural().min(1).default(20),
    block_size: Schema.natural().min(100).default(1000),
    max_retries: Schema.natural().min(0).default(5),
  })
}

export default NpmSynchronizer
