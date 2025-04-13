import type { Context } from '@p/core';
import type {} from '@web/core'

export const name = '@name';

export const inject = ['webui']

export function apply(ctx: Context) {
  ctx.webui.addEntry({
    base: import.meta.url,
    entry: './client/entry.ts'
  })
}
