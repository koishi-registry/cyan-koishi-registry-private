import type { CommunicationService, Packages } from "@p/communicate";

export const INDEX = 0

export function listen(object: object, name: string, handler: (...args: unknown[]) => void) {
  if ('addEventListener' in object) return (<any>object)['addEventListener'](name, handler)
  if ('addListener' in object) return (<any>object)['addListener'](name, handler)
  if ('on' in object) return (<any>object)['on'](name, handler)
  throw new TypeError(`Unable to add event listener for ${object}`)
}

export class WorkerChild<Remote extends Packages, Local extends Packages> {
  #online: Promise<void>
  #ready: Promise<unknown>
  #plug: Promise<unknown>
  #shared = new Int32Array(new SharedArrayBuffer(4))

  constructor(
    public chan: CommunicationService<{ Remote: Remote; Local: Local }>,
    protected worker: Worker,
  ) {
    const { promise: onlinePromise, resolve: resolveOnline, reject: rejectOnline } = Promise.withResolvers<void>()
    const { promise: readyPromise, resolve: resolveReady, reject: rejectReady } = Promise.withResolvers<unknown>()
    this.#online = onlinePromise
    this.#ready = readyPromise
    this.#plug = Promise.try(async () => Atomics.waitAsync(this.#shared, INDEX, 0).value)
    listen(worker, 'message', resolveOnline)
    listen(worker, 'error', rejectOnline)
    chan.receive('ready', resolveReady)
    onlinePromise.then(() => {
      this.worker.postMessage({
        case: 'initial',
        shared: this.#shared
      })
    })
  }

  async terminate() {
    return await this.worker.terminate()
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
