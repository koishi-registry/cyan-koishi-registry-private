import type { Context } from '@p/core';

export const name = 'krat-demo';
export const inject = ['krat'];

export function apply(ctx: Context) {
  ctx.krat.addEntry({
    base: import.meta.dir,
    entry: 'client/entry.ts',
  });
}
