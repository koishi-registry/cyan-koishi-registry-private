import { constants, access } from 'node:fs/promises';
import { rename } from 'node:fs/promises';
import { Module } from 'node:module';
import { dirname } from 'node:path';
import { toFileUrl } from '@std/path';
import { remove } from 'cosmokit';
import * as yaml from 'js-yaml';
import type { EntryOptions } from './entry.ts';
import type { ImportTree } from './import.ts';
import { JsExpr, unwrapExports } from './utils.ts';

export const schema = yaml.JSON_SCHEMA.extend(JsExpr);

export class LoaderFile {
  public suspend = false;
  public readonly: boolean;
  public trees: ImportTree[] = [];
  public writeTask?: NodeJS.Timer;

  constructor(
    public name: string,
    public type?: string,
  ) {
    this.readonly = !type;
  }

  ref(tree: ImportTree) {
    this.trees.push(tree);
    tree.url = toFileUrl(this.name).href;
    tree.ctx.loader.files[tree.url] ??= this;
    // use defineProperty to prevent provide check
    Object.defineProperty(tree.ctx, 'baseDir', {
      value: dirname(this.name),
      configurable: true,
    });
  }

  unref(tree: ImportTree) {
    remove(this.trees, tree);
    if (this.trees.length) return;
    delete tree.ctx.loader.files[tree.url];
  }

  async checkAccess() {
    if (!this.type) return;
    try {
      await access(this.name, constants.W_OK);
    } catch {
      await access(this.name, constants.R_OK).then(() => {
        this.readonly = true;
      });
    }
  }

  async read(): Promise<EntryOptions[]> {
    switch (this.type) {
      case 'application/yaml': // we assume the type matches
        return yaml.load(await Bun.file(this.name).text(), {
          schema,
        }) as EntryOptions[];
      case 'application/json':
        return JSON.parse(await Bun.file(this.name).text()) as EntryOptions[];
      default:
        return unwrapExports(await import(this.name));
    }
  }

  private async _write(config: EntryOptions[]) {
    this.suspend = true;
    if (this.readonly) throw new Error('cannot overwrite readonly config');

    const temp = `${this.name}.tmp`;

    if (this.type === 'application/yaml') {
      await Bun.file(temp).write(yaml.dump(config, { schema }));
    } else if (this.type === 'application/json') {
      await Bun.file(temp).write(JSON.stringify(config, null, 2));
    }

    await rename(temp, this.name);
  }

  write(config: EntryOptions[]) {
    clearTimeout(this.writeTask);
    this.writeTask = setTimeout(() => {
      this.writeTask = undefined;
      this._write(config).then();
    }, 0);
  }
}

export namespace LoaderFile {
  export const writable = {
    '.json': 'application/json',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',
  };

  export const supported = new Set(Object.keys(writable));

  // biome-ignore lint/complexity/noBannedTypes: for simplify
  for (const extname of Object.keys(
    Reflect.get(Module, '_extensions') as Record<string, Function>,
  )) {
    supported.add(extname);
  }
}
