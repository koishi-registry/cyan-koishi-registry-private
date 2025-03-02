import { Context } from '@p/core'
import Loader from '@p/loader'
// import Logger from 'reggol'
// import NpmSynchronizer from '@plug/npm'
// import Koishi from '@plug/koishi'
// import * as KoishiRegistry from '@plug/k-registry'
// import * as API from '@plug/api'
// import * as MarketAPI from '@plug/k-market'
// import * as ManageAPI from '@plug/manage'
// import { SimpleAnalyzer } from '@plug/k-analyzer'
// import Drizzle from '@p/database'
// import WebUI from '@web/plug-webui'

// TODO: use cordis loader

const host = Bun.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(Bun.env.PORT ?? '8000')

// Logger.levels.base = 5
export const app = new Context({
  server: {
    host,
    port,
  },
})

await app.plugin(Loader, {
  name: 'kra'
})
await app.loader.start()

// await app.plugin(WebUI)
// app.plugin(Drizzle, Deno.env.get("DATABASE_URL") ?? 'postgres://127.0.0.1:5432/kra')
// app.plugin(SimpleAnalyzer) // analyzer is required for KoishiRegistry
// app.plugin(Koishi)
// app.plugin(KoishiRegistry, {
//   generator: {
//     refreshInterval: 60 * 60,
//   },
// })
// app.plugin(NpmSynchronizer, { block_size: 1000, concurrent: 50 })
// app.plugin(API)
// app.plugin(MarketAPI)
// app.plugin(ManageAPI)
