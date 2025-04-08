import { lstat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { type Context, Service } from '@cordisjs/core';
import { asPath } from '@kra/path';
import { noop } from 'cosmokit';
import type Loader from '../loader.ts';
import { LoaderFile } from './file.ts';
import { EntryTree } from './tree.ts';

export class ImportTree<C extends Context = Context> extends EntryTree<C> {
  public file!: LoaderFile;

  constructor(public override ctx: C) {
    super(ctx);
    ctx.on('dispose', () => this.stop());
  }

  async start() {
    const data = await this.file.read();
    await this.file.checkAccess();
    await this.root.update(data);
  }

  stop() {
    this.file?.unref(this);
    return this.root.stop();
  }

  write() {
    this.context.emit('loader/config-update');
    return this.file.write(this.root.data);
  }

  async init(path: string, options: Loader.Config) {
    let baseDir = path;
    if (options.filename) {
      const filename = resolve(baseDir, options.filename);
      const stats = await lstat(filename);
      if (stats.isFile()) {
        baseDir = dirname(filename);
        const ext = extname(filename);
        const type = Reflect.get(LoaderFile.writable, ext);
        if (!LoaderFile.supported.has(ext)) {
          throw new Error(`extension "${ext}" not supported`);
        }
        this.file = new LoaderFile(filename, type);
        this.file.ref(this);
      } else {
        baseDir = filename;
        await this._init(baseDir, options);
      }
    } else {
      await this._init(baseDir, options);
    }
  }

  private async _init(baseDir: string, options: Loader.Config) {
    const { name, initial } = options;
    const entries = Object.fromEntries(
      await Promise.all(
        LoaderFile.supported
          .values()
          .map((extension) => name + extension)
          .map(async (name) => {
            const stat = await lstat(join(baseDir, name)).catch(noop);
            return [name, stat ? stat.isFile() : void 0];
          }),
      ),
    );

    for (const extension of LoaderFile.supported) {
      const isFile = Reflect.get(entries, name + extension);
      if (typeof isFile === 'undefined') continue;
      if (isFile === false)
        throw new Error(`config file "${isFile}" is not a file`);

      const type = Reflect.get(LoaderFile.writable, extension);
      const filename = resolve(baseDir, name + extension);
      this.file = new LoaderFile(filename, type);
      this.file.ref(this);
      return;
    }
    if (initial) {
      const type = LoaderFile.writable['.yml'];
      const filename = resolve(baseDir, `${name}.yml`);
      this.file = new LoaderFile(filename, type);
      this.file.ref(this);
      // biome-ignore lint/suspicious/noExplicitAny: we assume initial is a valid entry
      return this.file.write(initial as any);
    }
    throw new Error('config file not found');
  }
}

export namespace Import {
  export interface Config {
    url: string;
  }
}

export class Import extends ImportTree {
  constructor(
    ctx: Context,
    public config: Import.Config,
  ) {
    super(ctx);
  }

  async [Service.setup]() {
    const { url } = this.config;
    const filename = asPath(
      new URL(url, this.ctx.scope.entry!.parent.tree.url),
    );
    const ext = extname(filename);
    if (!LoaderFile.supported.has(ext)) {
      throw new Error(`extension "${ext}" not supported`);
    }
    this.file = new LoaderFile(filename, Reflect.get(LoaderFile.writable, ext));
    this.file.ref(this);
    await this.start();
  }
}
