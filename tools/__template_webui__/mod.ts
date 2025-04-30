import type { Context } from '@p/core';
import type {} from '@krts/intrinsic'

export const name = '@name';

export const inject = ['krat']

export function apply(ctx: Context) {
  ctx.krat.addEntry({
    base: import.meta.url,
    entry: './client/entry.ts'
  })
}
