import HttpService from '@cordisjs/plugin-http';
import LoggerService from '@cordisjs/plugin-logger';
import { Schema } from '@cordisjs/plugin-schema';
import TimerService from '@cordisjs/plugin-timer';
import { CommunicationService } from '@p/communicate';
import CacheService from '@plug/cache';
import * as LogPersist from '@plug/logger';
import { Server } from '@plug/server';
import StorageService from '@plug/storage';
import { join } from '@std/path';
import { type SemVer, compare, format, parse } from '@std/semver';
import * as cordis from 'cordis';
import type { Awaitable } from 'cosmokit';
import Logger from 'reggol';
import meta from './package.json' with { type: 'json' };

export interface Events<C extends Context = Context> extends cordis.Events<C> {
  'core/updated'(previous: SemVer, current: SemVer): void;

  exit(signal?: NodeJS.Signals): Promise<void>;
}

export interface Intercept<in C extends Context = Context>
  extends cordis.Intercept<C> {}

function registerSignalHandler(
  signal: NodeJS.Signals,
  handler: (signal: NodeJS.Signals) => Awaitable<void>,
) {
  process.on(signal, handler.bind(null, signal));
}

export const appName = 'koishi-registry';
export const runtimeName: 'bun' = <never>'Bun';

export interface Context {
  [Context.events]: Events<this>;
  [Context.intercept]: Intercept<this>;
  $kra: Kra;
  info: Kra;
  baseDir: string;
}

export class Context extends cordis.Context {
  constructor(config: Context.Config = {}) {
    super();

    const kra = new Kra(this);
    this.set('$kra', kra);
    this.accessor('info', { get: () => this.get('$kra') });
    this.on(
      'internal/inject',
      (prop, provider) => provider?.uid === this.scope.uid,
    );

    this.plugin(LoggerService);
    this.plugin(LogPersist);
    const logger = new Logger('app');
    logger.info(`${appName}/%C ${runtimeName}/%C`, meta.version, Bun.version);
    this.plugin(TimerService);
    this.plugin(HttpService);
    this.plugin(Server, config.server);
    this.plugin(CommunicationService);
    this.plugin(StorageService);
    this.plugin(CacheService);

    const handleSignal = (signal: NodeJS.Signals) => {
      // if (config.autoRestart) {
      // this.$communicate.post("exit", {});
      // }
      this.emit(this, 'internal/info', 'terminated by %C', signal);
      return this.parallel('exit', signal).then(() => process.exit());
    };

    registerSignalHandler('SIGINT', handleSignal);
    registerSignalHandler('SIGTERM', handleSignal);

    this.on('core/updated', () => {
      this.logger.info(
        'detected update %c -> %c',
        format(this.info.previous!),
        format(this.info.version),
      );
    });
  }
}

export type Updated = 'None' | 'Upgrade' | 'Downgrade';
export const Updated = {
  None: 'None' as Updated,
  Upgrade: 'Upgrade' as Updated,
  Downgrade: 'Downgrade' as Updated,
} as const;

export class Kra {
  isUpdated: Promise<boolean>;
  isUpgrade: Promise<boolean>;
  isDowngrade: Promise<boolean>;
  checkTask: Promise<Updated>;
  previous: SemVer | null = null;
  version: SemVer = parse(meta.version);
  baseDir = process.cwd();
  remotePlug = Boolean(Bun.env.REMOTE_PLUG ?? false);

  constructor(protected ctx: Context) {
    ctx.mixin('$kra', ['baseDir']);

    this.checkTask = new Promise((resolve) => {
      ctx.inject(['storage'], (ctx) => {
        resolve(this.check(ctx));
      });
    });
    this.isUpdated = new Promise((r) =>
      this.checkTask.then((x) => x !== Updated.None).then(r),
    );
    this.isUpgrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Upgrade).then(r),
    );
    this.isDowngrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Downgrade).then(r),
    );
  }

  async [cordis.symbols.setup]() {
    await this.checkTask;
  }

  async check(ctx: Context): Promise<Updated> {
    try {
      const current = this.version;
      const original = await ctx.storage.get<string>('version');
      if (original === null) {
        ctx.logger.info('updated to %c', format(current));
        this.previous = parse('0.0.1');
        ctx.emit('core/updated', this.previous, current);
        return Updated.Upgrade;
      }
      const previous = (this.previous = parse(original));
      const ordering = compare(previous, current);
      if (ordering !== 0) {
        ctx.emit('core/updated', previous, current);
        return ordering === 1 ? Updated.Downgrade : Updated.Upgrade;
      }
      return Updated.None;
    } finally {
      this.ctx.inject(['storage'], async (ctx) => {
        await ctx.storage.set('version', meta.version);
      });
    }
  }
}

export namespace Context {
  export interface Config {
    server?: Server.Config;
  }

  export const Config: Schema = Schema.object({
    server: Server.Config,
  });
}

// export { Service } from '@cordisjs/core'
