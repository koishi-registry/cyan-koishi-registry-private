import { Context, Service } from "./context.ts";
import trim from 'lodash.trim'
import Logger from 'reggol'
import type {} from '@cordisjs/plugin-http'
import type {} from '@cordisjs/plugin-logger'
import type {} from './storage/base.ts'
import { ScopeStatus } from "cordis";

declare module 'cordis' {
    export interface Events {
        'npm/fetched-packages'(records: ChangeRecord[]): void;
        'npm/fetched-plugins'(records: ChangeRecord[]): void;
    }
}

declare module './context.ts' {
    export interface Context {
        npm: NpmWatcher
    }
}

export interface Change {
    rev: string
}

export interface ChangeRecord {
    seq: number
    id: string
    changes: Change[],
    deleted?: boolean
}

export default class NpmWatcher extends Service {
    static inject = ['http', 'storage']

    fetchTask?: Promise<void>

    _seq = 8000000 // 2022-01(Koishi v4)
    plugins: Set<string> = new Set()

    get seq(): number {
        return this._seq
    }

    set seq(value: number) {
        this._seq = value
        this.ctx.storage.set("npm.seq", value)?.then?.()
    }

    constructor(ctx: Context) {
        super(ctx, 'npm');
    }

    public async flushPlugins() {
        await this.ctx.storage.set("npm.plugins", [...this.plugins])
    }

    async handle(stream: ReadableStream<Uint8Array>) {
        const decoder = new TextDecoderStream("utf-8")
        const reader = stream.pipeThrough(decoder).getReader()
        while (this.ctx.scope.isActive) {
            let result: ReadableStreamReadResult<string>;
            try {
                result = await reader.read()
            } catch {
                break
            }
            if (result.done) return
            const data = result.value

            const records: ChangeRecord[] = data
                .split('\n')
                .map(data => trim(data, ','))
                .filter(Boolean)
                .flatMap(data => {
                    try { return [JSON.parse(data)] } catch { return [] }
                })

            if (records.length > 0) {
                const last = records[records.length - 1]
                await this.ctx.parallel('npm/fetched-packages', records)
                // this.ctx.logger.debug(`Fetched ${records.length} packages from replicate.npmjs.com`)
                this.seq = last.seq
            }

            const filtered = records.filter(this.isKoishiPlugin)

            if (filtered.length > 0) {
                await this.ctx.parallel('npm/fetched-plugins', filtered)
                this.ctx.logger.debug(`Fetched ${filtered.length} plugins from replicate.npmjs.com`)
                filtered.forEach(record => this.plugins.add(record.id))
                await this.flushPlugins()
                console.log('-- data: ', filtered)
            }
        }
    }

    isKoishiPlugin(data: ChangeRecord): boolean {
        if (data.id.startsWith('@koishijs/plugin-')) return true
        if (!data.id.includes("koishi-plugin")) return false
        if (data.id.match("/^(@[a-z0-9-~][a-z0-9-._~]*\\/)?koishi-plugin-[a-z0-9-._~]*$/")) return true
        return false
    }

    private async fetch() {
        // const response = await this.ctx.http(`https://replicate.npmjs.com/_changes?filter=_selector&since=${this.seq}`, {
        //     responseType: (response) => response.body,
        //     method: 'POST',
        //     data: {
        //         selector: { '_id': { $regex: '^.*koishi.*$' } }
        //     }
        // })

        this.ctx.logger.debug("start fetching (seq: %c)...", this.seq)
        while (this.ctx.scope.isActive) {
            const response = await this.ctx.http(`https://replicate.npmjs.com/_changes?since=${this.seq}`, {
                responseType: (response) => response.body,
            })
            const body: ReadableStream<Uint8Array> = response.data

            await this.handle(body)
        }
    }



    override async start() {
        if (await this.ctx.storage.has('npm.seq')) {
            this.seq = await this.ctx.storage.get('npm.seq');
            this.ctx.logger.debug("restored seq %c", this.seq)
        }
        if (await this.ctx.storage.has('npm.plugins')) {
            this.plugins = new Set(await this.ctx.stoarge.get('npm.plugins'));
            this.ctx.logger.debug("restored %c plugin(s)", this.plugins.size)
        }

        this.fetchTask = this.fetch().catch(this.ctx.scope.cancel)
    }
}
