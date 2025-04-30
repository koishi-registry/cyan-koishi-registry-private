import { KraConfig } from "./config";
import { type SemVer, compare, format, parse } from '@std/semver';
import meta from './package.json' with { type: 'json' };
import type { Context } from "./context";
import * as cordis from '@cordisjs/core'

declare module '@cordisjs/core' {
  export interface Context {
    $kra: KraInfo;
    $info: KraInfo;
  }
}

export type Updated = 'None' | 'Upgrade' | 'Downgrade';
export const Updated = {
  None: 'None' as Updated,
  Upgrade: 'Upgrade' as Updated,
  Downgrade: 'Downgrade' as Updated,
} as const;

export class KraInfo {
  isUpdated: Promise<boolean>;
  isUpgrade: Promise<boolean>;
  isDowngrade: Promise<boolean>;
  checkTask: Promise<Updated>;
  previous: SemVer | null = null;
  version: SemVer = parse(meta.version);
  baseDir = process.cwd();
  remotePlug = Boolean(process.env.REMOTE_PLUG ?? false);
  config: KraConfig

  constructor(protected ctx: Context) {
    ctx.mixin('$kra', ['baseDir']);
    ctx.alias('$kra', ['$info'])

    this.config = new KraConfig(this)

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
