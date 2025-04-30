import { asURL } from '@kra/path'
import { Context } from '@p/core'
import Loader from '@p/loader'
import { destr } from 'destr'
import { WorkerClientService } from './client'

export default async (entry: string, port: MessagePort, opt?: string) => {
  const app = new Context({ noBanner: true, app: false })
  app.on('internal/error', console.error)
  app.on('internal/warning', console.warn)

  await app.plugin(WorkerClientService)

  const [scope] = await app.$worker.ext$install(entry, port, destr(opt))

  const interval = setInterval(async () => { // keep alive
    if (scope.active) await scope
  }, 100)
  scope.effect(() => () => clearInterval(interval))

  return [app, scope] as const
}
