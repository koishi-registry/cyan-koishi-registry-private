import { compare, format, parse, SemVer } from '@std/semver'
import { Awaitable } from 'cosmokit'
import * as cordis from 'cordis'
import { Server } from '@plug/server'
import StorageService from '@plug/storage'
import CacheService from '@plug/cache'
import Logger from 'reggol'
import { Schema } from '@cordisjs/plugin-schema'
import HttpService from '@cordisjs/plugin-http'
import TimerService from '@cordisjs/plugin-timer'
import LoggerService from '@cordisjs/plugin-logger'
import * as LogPersist from '@plug/logger'
import { dirname, fromFileUrl } from '@std/path'
import meta from './deno.json' with { type: 'json' }
import { CommunicationService } from "@p/communicate";

export interface Events<in C extends Context = Context>
  extends cordis.Events<C> {
  'core/updated'(previous: SemVer, current: SemVer): void

  'exit'(signal?: Deno.Signal): void
}

export interface Intercept<in C extends Context = Context> extends cordis.Intercept<C> {}

export function registerSignalHandler(
  signal: Deno.Signal,
  handler: (signal: Deno.Signal) => Awaitable<void>,
) {
  Deno.addSignalListener(signal, () => handler(signal))
}

export interface Context {
  [cordis.symbols.events]: Events<this>
  [cordis.symbols.intercept]: Intercept<this>
}

export class Context extends cordis.Context {

  declare baseDir: string

  info: AppInfo

  constructor(config: Context.Config = {}) {
    super()

    this.info = new AppInfo(this)

    this.plugin(LoggerService)
    this.plugin(LogPersist)
    const logger = new Logger('app')
    logger.info('App/%C Deno/%C', meta.version, Deno.version.deno)
    this.plugin(TimerService)
    this.plugin(HttpService)
    this.plugin(Server, config.server)
    this.plugin(CommunicationService)
    this.plugin(StorageService)
    this.plugin(CacheService)

    const handleSignal = async (signal: Deno.Signal) => {
      await this.parallel('exit', signal)
      this.registry.values().forEach(
        (rt) =>
          rt.scopes
            .clear()
            .forEach((scope) => scope.dispose()),
      )
      Deno.exit()
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

export enum Updated {
  None,
  Upgrade,
  Downgrade,
}

export class AppInfo {
  isUpdated: Promise<boolean>
  isUpgrade: Promise<boolean>
  isDowngrade: Promise<boolean>
  checkTask: Promise<Updated>
  previous: SemVer | null = null
  version: SemVer = parse(meta.version)
  baseDir = dirname(fromFileUrl(import.meta.url))

  constructor(protected ctx: Context) {
    ctx.mixin('info', ['baseDir'])

    this.checkTask = new Promise(resolve => {
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
      const original = await ctx.storage.getRaw('version')
      if (original === null) {
        ctx.logger.info('updated to %c', format(current))
        this.previous = parse('0.0.1')
        ctx.emit('core/updated', this.previous, current)
        return Updated.Upgrade
      }
      const previous = this.previous = parse(original)
      const ordering = compare(previous, current)
      if (ordering !== 0) {
        ctx.emit('core/updated', previous, current)
        return ordering == 1 ? Updated.Downgrade : Updated.Upgrade
      } else return Updated.None
    } finally {
      this.ctx.inject(['storage'], async (ctx) => {
        await ctx.storage.setRaw('version', meta.version)
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

export abstract class Service<C extends Context = Context>
  extends cordis.Service<C> {
  declare protected ctx: C
}
// export { Service } from '@cordisjs/core'
