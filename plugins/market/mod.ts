import type { Context } from '@p/core'
import type {} from '@plug/koishi'
import type { Features } from '@plug/k-registry'
import type { KoishiMarket } from '@plug/k-registry/types'

export const inject = [
  'server',
  'koishi',
  'koishi.generator',
  'koishi.analyzer',
  'koishi.meta',
]

export function apply(ctx: Context) {
  const logger = ctx.logger('k-market')
  logger.info('source is available at %c', ctx.server.selfUrl + '/index.json')
  ctx.server.on('GET', ['/', '/index.json'], async (c) => {
    const result = await ctx.koishi.generator.getObjects()
    return c.json(
      {
        time: ctx.koishi.generator.last_refresh.toUTCString(),
        total: result.length,
        version: 1, // remove this will cause Koishi client to fetch npm again
        objects: result,
        synchronized: ctx.koishi.generator.isSynchronized(),
        features: ctx.koishi.generator.getFeatures(),
      } satisfies KoishiMarket.Result & {
        synchronized: boolean
        features: Features
      },
    )
  })
}
