import type { Context } from '@web/client';

export default async (ctx: Context) => {
  ctx.logger.info("Hello from client");
};
