import type { Context } from '@p/core';

export const name = 'webui-test';
export const inject = ['webui'];

export function apply(ctx: Context) {
  ctx.webui.addEntry({
    base: import.meta.dir,
    entry: 'client/entry.ts',
  });
}
