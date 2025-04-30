import { asURL } from '@kra/path';
import type { CommunicationService, Packages } from '@p/communicate';
import { Service, type Context } from '@p/core';
import { WorkerChild } from './worker';

const mainModule = new URL(import.meta.resolve('./client/main.ts'))

declare module '@p/core' {
  export interface Context {
    worker: WorkerService
  }
}

export { WorkerChild } from './worker'

export class WorkerService extends Service {
  static inject = ['$communicate']
  #children: WorkerChild<Packages, Packages>[] = []

  constructor(ctx: Context) {
    super(ctx, 'worker')
  }

  private _child = <RSide extends Packages, LSide extends Packages>(comm: CommunicationService) => {
    const child = new WorkerChild(
      this.ctx,
      comm.cast(),
      comm.conn.getInner() as Worker
    )
    this.ctx.effect(() => () => child.terminate())
    this.#children.push(child)
    return child.cast<RSide, LSide>()
  }

  spawn<RSide extends Packages, LSide extends Packages>(url: URL | string, config: unknown) {
    const module = new URL(mainModule)
    const href = new URL(url).href
    module.searchParams.append('module', href)
    const comm = this.ctx.$communicate.worker(module, {
      argv: [href, JSON.stringify(config)],
      preload: href,
    })
    return this._child<RSide, LSide>(comm)
  }
}

export default WorkerService
