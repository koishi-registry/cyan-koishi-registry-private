import { Context } from '@p/core'
import NpmSynchronizer from '@plug/npm'
// import Logger from 'reggol'
import * as KoishiRegistry from '@plug/k-registry'
import * as API from '@plug/api'
import * as MarketEndpoints from '@plug/market'
import * as ManageAPI from '@plug/manage'
import { SimpleAnalyzer } from '@plug/k-analyzer'
import WebUI from '@web/plug-webui'
import '@std/dotenv/load'

// TODO: use cordis loader

const host = Deno.env.get('HOST') ?? '127.0.0.1'
const port = parseInt(Deno.env.get('PORT') ?? '8000')

// Logger.levels.base = 5
const app = new Context({
  server: {
    host,
    port,
  },
})
await app.plugin(WebUI)
app.plugin(SimpleAnalyzer) // analyzer is required for KoishiRegistry
app.plugin(KoishiRegistry, {
  generator: {
    refreshInterval: 60 * 60,
  },
})
app.plugin(NpmSynchronizer, { block_size: 1000, concurrent: 50 })
app.plugin(API)
app.plugin(MarketEndpoints)
app.plugin(ManageAPI)
