import { asURL } from '@kra/path'
import { Context } from '@p/core'
import Loader from '@p/loader'
import { destr } from 'destr'

if (process.argv.length !== 3 && process.argv.length !== 4) throw new TypeError(`Invalid arguments, received ${process.argv}`)
const [exec, mainEntry, pluginEntry, pluginOpt] = process.argv

const app = new Context({ noBanner: true, app: false })
app.on('internal/error', console.error)
app.on('internal/warning', console.warn)

const plugin = await import(new URL(pluginEntry).href).then(Loader.unwrapExports).catch(error => {
  app.emit('internal/error', 'unable to load entry plugin', error)
})
if (!plugin) throw new Error("Invalid Plugin")

const scope = app.plugin(plugin, destr(pluginOpt))

setInterval(async () => {
  if (scope.active) await scope
}, 100)
