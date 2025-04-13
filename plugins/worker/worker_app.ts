import { asURL } from '@kra/path'
import { Context } from '@p/core'
import Loader from '@p/loader'
import { destr } from 'destr'

export default async (entry: string, opt?: string) => {
  const app = new Context({ noBanner: true, app: false })
  app.on('internal/error', console.error)
  app.on('internal/warning', console.warn)

  const plugin = await import(new URL(entry).href).then(Loader.unwrapExports).catch(error => {
    app.emit('internal/error', 'unable to load entry plugin', error)
  })
  if (!plugin) throw new Error("Invalid Plugin")

  const scope = app.plugin(plugin, destr(opt))

  const interval = setInterval(async () => {
    if (scope.active) await scope
  }, 100)
  scope.effect(() => () => clearInterval(interval))

  return [app, scope] as const
}
