import { Context } from './context.ts'
import { KoishiMarket } from "./koishi_registry/types.ts";
import type { Features } from './koishi_registry'

export const inject = ['hono', 'koishi', 'koishi.generator', 'koishi.analyzer', 'koishi.meta']

export function apply(ctx: Context) {
    ctx.hono.on("GET", ['/', '/index.json'], async (c) => {
        const result = await ctx.koishi.generator.getObjects()
        return c.json({
            time: ctx.koishi.generator.last_refresh.toUTCString(),
            total: result.length,
            version: 1, // remove this will cause Koishi client to fetch npm again
            objects: result,
            synchronized: ctx.koishi.generator.isSynchronized(),
            features: ctx.koishi.generator.getFeatures()
        } satisfies KoishiMarket.Result & { synchronized: boolean, features: Features })
    })
}

