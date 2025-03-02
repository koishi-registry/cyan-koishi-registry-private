import type { Context } from '@p/core'
import { bearerAuth } from 'hono/bearer-auth'
import { verify } from 'paseto-ts/v4'
import type {} from '@plug/koishi'
import type {} from '@plug/k-registry'

export const name = 'manage'
export const inject = ['server', 'http']

export const KEY = Bun.env.PUBLIC_KEY ??
  'k4.public.ZHCAZC7yPzIS42O8SG1luDNVc61rhvbMvUXCkrpVFic'

export const TRUSTED_USER = [
  'cyan',
  'itzdrli',
]

export function apply(ctx: Context) {
  ctx.server.use(
    '/api/admin/*',
    bearerAuth({
      async verifyToken(token, _) {
        try {
          const { payload } = verify<{ user: string; version: number }>(
            KEY,
            token,
          )
          if (payload.version !== 1) return false
          if (!TRUSTED_USER.includes(payload.user)) {
            const { exist } = await ctx.http.get<{ exist: boolean }>(
              '/api/auth/user/' + encodeURIComponent(payload.user),
            )
            return exist
          }
          return true
        } catch {
          return false
        }
      },
    }),
  )
  ctx.server.post('/api/admin/trigger_full_refresh', (c) => {
    ctx.inject(['koishi', 'koishi.npm'], async (ctx) => {
      await ctx.koishi.npm.fetchNpm()
    })
    return c.json({
      msg: 'scheduled',
    })
  })
  ctx.server.post('/api/admin/refresh/:name', (c) => {
    const refresh_meta = !!c.req.query('include_meta')
    const name = c.req.param('name')
    ctx.inject(['koishi', 'koishi.generator', 'koishi.meta'], async (ctx) => {
      await ctx.koishi.generator.fetchObject(name, true, refresh_meta)
    })
    return c.json({
      msg: 'scheduled',
    })
  })
}
