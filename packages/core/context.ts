import { compare, format, parse, type SemVer } from '@std/semver'
import type { Awaitable } from 'cosmokit'
import * as cordis from 'cordis'
import { join } from '@std/path'
import { Server } from '@plug/server'
import StorageService from '@plug/storage'
import CacheService from '@plug/cache'
import Logger from 'reggol'
import * as yaml from 'js-yaml'
import { Schema } from '@cordisjs/plugin-schema'
import HttpService from '@cordisjs/plugin-http'
import TimerService from '@cordisjs/plugin-timer'
import LoggerService from '@cordisjs/plugin-logger'
import * as LogPersist from '@plug/logger'
import meta from './package.json' with { type: 'json' }
import { CommunicationService } from '@p/communicate'

const appMeta = yaml.load(await Bun.file(join(process.cwd(), "kra.yaml")).text())

export interface Events<in C extends Context = Context>
  extends cordis.Events<C> {
  'core/updated'(previous: SemVer, current: SemVer): void

  'exit'(signal?: NodeJS.Signals): Promise<void>
}

export interface Intercept<in C extends Context = Context>
  extends cordis.Intercept<C> {}

function registerSignalHandler(
  signal: NodeJS.Signals,
  handler: (signal: NodeJS.Signals) => Awaitable<void>,
) {
  process.on(signal, handler.bind(null, signal))
}

export const appName = 'koishi-registry'
export const runtimeName: 'bun' = <never>'Bun'

export class Context extends cordis.Context {
  declare baseDir: string
  declare [Context.events]: Events<this>
  declare [Context.intercept]: Intercept<this>

  info: AppInfo

  constructor(config: Context.Config = {}) {
    super()

    this.info = new AppInfo(this)

    this.plugin(LoggerService)
    this.plugin(LogPersist)
    const logger = new Logger('app')
    logger.info(
      `${appName}/%C ${runtimeName}/%C`,
      meta.version,
      Bun.version,
    )
    this.plugin(TimerService)
    this.plugin(HttpService)
    this.plugin(Server, config.server)
    this.plugin(CommunicationService)
    this.plugin(StorageService)
    this.plugin(CacheService)

    const handleSignal = (signal: NodeJS.Signals) => {
      return this.parallel('exit', signal)
    }

    registerSignalHandler('SIGINT', handleSignal)
    registerSignalHandler('SIGTERM', handleSignal)

    this.on('core/updated', () => {
      this.logger.info(
        'detected update %c -> %c',
        format(this.info.previous!),
        format(this.info.version),
      )
    })
  }
}

export type Updated = 'None' | 'Upgrade' | 'Downgrade'
export const Updated = {
  None: 'None' as Updated,
  Upgrade: 'Upgrade' as Updated,
  Downgrade: 'Downgrade' as Updated,
}

export class AppInfo {
  isUpdated: Promise<boolean>
  isUpgrade: Promise<boolean>
  isDowngrade: Promise<boolean>
  checkTask: Promise<Updated>
  previous: SemVer | null = null
  version: SemVer = parse(meta.version)
  baseDir = process.cwd()
  remotePlug = Boolean(Bun.env.REMOTE_PLUG ?? false)

  constructor(protected ctx: Context) {
    ctx.mixin('info', ['baseDir'])

    this.checkTask = new Promise((resolve) => {
      ctx.inject(['storage'], (ctx) => {
        resolve(this.check(ctx))
      })
    })
    this.isUpdated = new Promise((r) =>
      this.checkTask.then((x) => x !== Updated.None).then(r)
    )
    this.isUpgrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Upgrade).then(r)
    )
    this.isDowngrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Downgrade).then(r)
    )
  }

  async [cordis.symbols.setup]() {
    await this.checkTask
  }

  async check(ctx: Context): Promise<Updated> {
    try {
      const current = this.version
      const original = await ctx.storage.get<string>('version')
      if (original === null) {
        ctx.logger.info('updated to %c', format(current))
        this.previous = parse('0.0.1')
        ctx.emit('core/updated', this.previous, current)
        return Updated.Upgrade
      }
      // biome-ignore lint/suspicious/noAssignInExpressions: assign
      const previous = this.previous = parse(original)
      const ordering = compare(previous, current)
      if (ordering !== 0) {
        ctx.emit('core/updated', previous, current)
        return ordering === 1 ? Updated.Downgrade : Updated.Upgrade
      }
      return Updated.None
    } finally {
      this.ctx.inject(['storage'], async (ctx) => {
        await ctx.storage.set('version', meta.version)
      })
    }
  }
}

export namespace Context {
  export interface Config {
    server?: Server.Config
  }

  export const Config: Schema = Schema.object({
    server: Server.Config,
  })
}

// export { Service } from '@cordisjs/core'
