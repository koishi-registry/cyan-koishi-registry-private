import { compare, format, parse, SemVer } from "@std/semver";
import * as cordis from "cordis";
import { Server } from "./server.ts";
import Storage from "./storage";
import CacheService from "./cache.ts";
import Logger from "reggol";
import Schema from "schemastery";
import HttpService from "@cordisjs/plugin-http";
import TimerService from "@cordisjs/plugin-timer";
import * as LogPersist from "./log.ts";
import { dirname, fromFileUrl, join } from "@std/path";
import meta from "./deno.json" with { type: "json" };

export interface Events<in C extends Context = Context>
  extends cordis.Events<C> {
  "core/updated"(previous: SemVer, current: SemVer): void;
}

export interface Context {
  [Context.events]: Events<this>;
}

export class Context extends cordis.Context {
  info: AppInfo;

  constructor(config: Context.Config = {}) {
    super();
    this.plugin(LogPersist);
    const logger = new Logger("app");
    logger.info("App/%C Deno/%C", meta.version, Deno.version.deno);
    this.plugin(TimerService);
    this.plugin(HttpService);
    this.plugin(Server, config.server);
    this.plugin(Storage);
    this.plugin(CacheService);
    this.on("core/updated", () => {
      this.logger.info(
        "detected update %c -> %c",
        format(this.info.previous!),
        format(this.info.version),
      );
    });
    this.info = new AppInfo(this);
  }
}

export enum Updated {
  None,
  Upgrade,
  Downgrade,
}

export class AppInfo {
  isUpdated: Promise<boolean>;
  isUpgrade: Promise<boolean>;
  isDowngrade: Promise<boolean>;
  checkTask: Promise<Updated>;
  previous: SemVer | null = null;
  version: SemVer = parse(meta.version);
  cacheDir = join(dirname(fromFileUrl(Deno.mainModule)), "cache");

  constructor(protected ctx: Context) {
    this.checkTask = this.check();
    this.isUpdated = new Promise((r) =>
      this.checkTask.then((x) => x !== Updated.None).then(r)
    );
    this.isUpgrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Upgrade).then(r)
    );
    this.isDowngrade = new Promise((r) =>
      this.checkTask.then((x) => x === Updated.Downgrade).then(r)
    );
  }

  async [cordis.symbols.setup]() {
    await this.checkTask;
  }

  async check(): Promise<Updated> {
    try {
      const current = this.version;
      const original = await this.ctx.storage.getRaw("version");
      if (original === null) {
        this.ctx.logger.info("updated to %c", format(current));
        this.previous = parse("0.0.1");
        this.ctx.emit("core/updated", this.previous, current);
        return Updated.Upgrade;
      }
      const previous = this.previous = parse(original);
      const ordering = compare(previous, current);
      if (ordering !== 0) {
        this.ctx.emit("core/updated", previous, current);
        return ordering == 1 ? Updated.Downgrade : Updated.Upgrade;
      } else return Updated.None;
    } finally {
      await this.ctx.storage.setRaw("version", meta.version);
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

export abstract class Service<C extends Context = Context>
  extends cordis.Service<C> {
  declare protected ctx: C;
}
// export { Service } from '@cordisjs/core'
