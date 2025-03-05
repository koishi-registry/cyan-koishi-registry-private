import type { Context } from '@p/core';

export const name = 'indexing';

export function apply(ctx: Context) {
  ctx.logger.info('Hello World');
}
