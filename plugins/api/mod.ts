import type { Context } from '@p/core';
import type {} from '@plug/npm';
import type {} from '@plug/koishi';
import type {} from '@plug/k-analyzer';
import type {} from '@plug/k-registry';

export const name = 'api';
export const inject = ['server', 'timer'];

export function apply(ctx: Context) {
  let functionality = {
    generator: !!ctx.root.get('koishi.generator'),
    analyzer: !!ctx.root.get('koishi.analyzer'),
    npm: !!ctx.root.get('npm'),
  };
  const checkFunctionality = ctx.throttle(
    () =>
      (functionality = {
        generator: !!ctx.root.get('koishi.generator'),
        analyzer: !!ctx.root.get('koishi.analyzer'),
        npm: !!ctx.root.get('npm'),
      }),
    100,
  );
  ctx.server.get('/api/status', (c) => {
    checkFunctionality();
    return c.json({
      version: ctx.info.version,
      functionality: functionality,
    });
  });
  ctx.inject(['npm'], (ctx) => {
    ctx.server.get('/api/plugins', (c) => {
      return c.json({
        synchronized: ctx.npm.synchronized,
        list: [...ctx.npm.plugins.keys()],
      });
    });
  });
  ctx.inject(
    ['koishi', 'koishi.generator', 'koishi.meta', 'koishi.analyzer'],
    (ctx) => {
      ctx.server.get('/api/generator/status', (c) => {
        return c.json({
          version: ctx.info.version,
          updateAt: ctx.koishi.generator.last_refresh.toUTCString(),
          synchronized: ctx.koishi.generator.isSynchronized(),
          features: ctx.koishi.generator.getFeatures(),
        });
      });
      ctx.server.get('/api/generator/:name', async (c) => {
        const name = c.req.param('name')!;
        const result = await ctx.koishi.generator.fetchObject(name);
        if (result === null) {
          return c.json(
            {
              name: name,
              status: 404,
              message: 'not found',
            },
            404,
          );
        }
        return c.json({
          name: name,
          status: 200,
          data: result,
          message: 'fetched',
        });
      });
    },
  );
}
