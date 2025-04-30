import type { CommunicationService, Packages } from "@p/communicate";
import type { SignalMaster } from "./types";
import { Service, type Context } from "@p/core";
import { MessagePortCommunicator } from "@p/communicate/port";

export const INDEX = 0

export function listen(object: object, name: string, handler: (...args: unknown[]) => void) {
  if ('addEventListener' in object) return (<any>object)['addEventListener'](name, handler)
  if ('addListener' in object) return (<any>object)['addListener'](name, handler)
  if ('on' in object) return (<any>object)['on'](name, handler)
  throw new TypeError(`Unable to add event listener for ${object}`)
}

interface SignalRemote extends Packages {}
interface SignalLocal extends Packages {}

export class WorkerChild<Remote extends Packages, Local extends Packages> {
  #online: Promise<void>
  #ready: Promise<unknown>
  #plug: Promise<unknown>
  #shared = new Int32Array(new SharedArrayBuffer(4))

  chan: CommunicationService<{ Remote: Remote; Local: Local }>

  constructor(
    protected ctx: Context,
    protected signal: SignalMaster,
    protected worker: Worker,
  ) {
    const { promise: onlinePromise, resolve: resolveOnline, reject: rejectOnline } = Promise.withResolvers<void>()
    const { promise: readyPromise, resolve: resolveReady, reject: rejectReady } = Promise.withResolvers<unknown>()
    this.#online = onlinePromise
    this.#ready = readyPromise
    this.#plug = Promise.try(async () => Atomics.waitAsync(this.#shared, INDEX, 0).value)
    listen(worker, 'message', resolveOnline)
    listen(worker, 'error', rejectOnline)
    signal.receive('ready', resolveReady)
    const { port1, port2 } = new MessageChannel()
    this.chan = ctx.$communicate[Service.extend]({
      conn: new MessagePortCommunicator(ctx, port1)
    })
    if (ctx.get('storage')) {
      const storage = ctx.get('storage')!
      storage?.tryForward(this.chan.cast())
    }
    onlinePromise.then(() => {
      this.worker.postMessage({
        case: 'initial',
        shared: this.#shared,
        port: port2
      }, [port2])
    })
  }

  async terminate() {
    return this.worker.terminate()
  }

  cast<RSide extends Packages, LSide extends Packages>(): WorkerChild<RSide, LSide> {
    return <unknown>this as WorkerChild<RSide, LSide>
  }

  get online(): Promise<Worker> {
    return this.#online.then(() => this.worker)
  }

  get ready(): Promise<unknown> {
    return Promise.all([this.#ready, this.#plug]).then(x => x[0])
  }
}
