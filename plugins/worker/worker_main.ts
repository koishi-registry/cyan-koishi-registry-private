import { INDEX } from './worker'
import { type } from 'arktype'

if (process.argv.length !== 3 && process.argv.length !== 4) throw new TypeError(`Invalid arguments, received ${process.argv}`)
const [exec, mainEntry, pluginEntry, pluginOpt] = process.argv

const { promise: shared, resolve } = Promise.withResolvers<Int32Array>()

const message = type({
  case: "'initial'",
  shared: "TypedArray.Int32"
}).describe("valid initialize message")

function onmessage(ev: MessageEvent<{ case: 'initial', shared: Int32Array }>) {
  const { case: type, shared } = message.assert(ev.data)
  resolve(shared)
}

declare let self: Worker

Reflect.set(self, 'onmessage', onmessage)
self.postMessage({
  ready: true
})
shared.then(async shared => {
  Reflect.set(self, 'onmessage', null)
  const { default: load } = await import('./worker_app')

  const [app, scope] = await load(pluginEntry, pluginOpt)
  scope.then(() => Atomics.notify(shared, INDEX))
})
