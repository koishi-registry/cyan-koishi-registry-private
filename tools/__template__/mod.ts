import type { Context } from '@p/core';

export const name = '@name';

export function apply(ctx: Context) {
  ctx.logger.info('Hello World');
}
