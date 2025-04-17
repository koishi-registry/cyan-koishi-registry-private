import type { Context } from '@krts/terminal';

export const name = '@name'
export const inject = ['logger']

export function apply(ctx: Context) {
  ctx.logger.info("Hello from client");
};
