import { readFile } from 'node:fs/promises';
// import * as dotenv from 'npm:dotenv'
// import * as path from 'node:path'
import * as process from 'node:process';
import { Loader } from './loader.ts';

export * from './loader.ts';

const oldEnv = { ...Bun.env };

namespace BunLoader {
  export interface Config extends Loader.Config {}
}

class BunLoader extends Loader {
  static readonly exitCode = 51;

  override async init(baseDir: string, options: Loader.Config) {
    await super.init(baseDir, options);

    // restore process.env
    for (const key in Bun.env) {
      if (key in oldEnv && oldEnv[key]) {
        Bun.env[key] = oldEnv[key as keyof typeof oldEnv]!;
      } else {
        delete Bun.env[key];
      }
    }

    // Bun automatically
    // load .env files
    // const override = {}
    // const envFiles = ['.env', '.env.local']
    // for (const filename of envFiles) {
    //   try {
    //     const raw = await readFile(
    //       path.resolve(this.ctx.baseDir, filename),
    //       'utf8',
    //     )
    //     Object.assign(override, dotenv.parse(raw))
    //   } catch { void 0; }
    // }

    // // override process.env
    // for (const key in override) {
    //   Bun.env[key] = override[key as keyof typeof override]
    // }
  }

  override async start() {
    await this.init(process.cwd(), this.config);
    this.ctx.set('env', Bun.env);
    await super.start();
  }

  override async exit(code = BunLoader.exitCode) {
    const body = JSON.stringify(this.envData);
    return this.ctx.$communicate
      .post('disposed', { body })
      .then(() => {
        this.ctx.emit(this.ctx, 'internal/info', 'trigger full reload');
        process.exit(code);
      })
      .catch((_) => {
        this.ctx.emit(this.ctx, 'internal/error', 'failed to send shared data');
      });
  }
}

export default BunLoader;
