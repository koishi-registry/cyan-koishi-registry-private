import { ensureDir } from '@kra/fs';
import { asPath, join } from '@kra/path';
import type { Context } from '@p/core';

export class UIPaths {
  dist: string;
  vendor: string;
  infra: string;
  client: string;

  constructor(
    protected ctx: Context,
    cacheDir: string,
  ) {
    this.client = asPath(
      new URL('./app', import.meta.resolve('@krts/terminal/deno.json')),
    );
    this.dist = join(cacheDir, 'krts');
    this.vendor = join(this.dist, 'vendors');
    this.infra = join(this.dist, 'base');
  }

  async ensureDir() {
    await Promise.all([
      ensureDir(this.dist),
      ensureDir(this.infra),
      ensureDir(this.vendor),
    ]);
  }

  entryVendor(id: string) {
    return join(this.dist, 'vendors', id);
  }
}
