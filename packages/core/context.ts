import HttpService from '@cordisjs/plugin-http';
import LoggerService from '@cordisjs/plugin-logger';
import { Schema } from '@cordisjs/plugin-schema';
import TimerService from '@cordisjs/plugin-timer';
import { CommunicationService } from '@p/communicate';
import CacheService from '@plug/cache';
import * as LogPersist from '@plug/logger';
import StorageService from '@plug/storage';
import { join } from '@std/path';
import { type SemVer, compare, format, parse } from '@std/semver';
import * as cordis from '@cordisjs/core';
import type { Awaitable } from 'cosmokit';
import Logger from 'reggol';
import meta from './package.json' with { type: 'json' };
import { KraInfo } from './info.ts';

export interface Events<in C extends Context = Context> extends cordis.Events<C> {
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

export const appName = 'Kra';

export interface Context {
  [Context.events]: Events<this>;
  [Context.intercept]: Intercept<this>;
  baseDir: string;
}

export class Context extends cordis.Context {
  constructor(config: Context.Config = {}) {
    super();

    const kra = new KraInfo(this);
    this.set('$kra', kra);
    this.alias('$kra', ['$info', 'info'])
    this.on(
      'internal/inject',
      (prop, provider) => provider?.uid === this.scope.uid,
    );

    this.plugin(LoggerService);
    this.plugin(LogPersist);
    const logger = new Logger('app');
    if (!config.noBanner) logger.info(`${appName}/%C %C`, meta.version, navigator.userAgent);
    this.plugin(TimerService);
    this.plugin(HttpService);
    this.plugin(CommunicationService);
    this.plugin(StorageService);
    this.plugin(CacheService);

    const self = this as Context

    const handleSignal = (signal: NodeJS.Signals) => {
      // if (config.autoRestart) {
      // this.$communicate.post("exit", {});
      // }
      self.emit(this, 'internal/info', 'terminated by %C', signal);
      return self.parallel('exit', signal).then(() => process.exit());
    };

    registerSignalHandler('SIGINT', handleSignal);
    registerSignalHandler('SIGTERM', handleSignal);

    this.on('core/updated', () => {
      if (config.app === true)
         this.logger.info(
          'detected update %c -> %c',
          format(this.$info.previous!),
          format(this.$info.version),
        );
    });
  }
}

export namespace Context {
  export interface Config {
    noBanner?: boolean
    app?: boolean
  }

  export const Config: Schema = Schema.object({
    noBanner: Schema.boolean().default(false),
    app: Schema.boolean().default(true)
  });
}

// export { Service } from '@cordisjs/core'
