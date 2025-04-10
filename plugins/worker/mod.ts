import { asURL } from '@kra/path';
import type { C2SPackages, CommunicationService, S2CPackages } from '@p/communicate';
import { Service, type Context } from '@p/core';

const mainModule = new URL(import.meta.resolve('./worker_main.ts'))

declare module '@p/core' {
  export interface Context {
    worker: WorkerService
  }
}

export class WorkerService extends Service {
  static inject = ['$communicate']

  constructor(ctx: Context) {
    super(ctx, 'worker')
  }

  spawn<RSide extends S2CPackages, LSide extends C2SPackages>(url: URL | string, options?: unknown) {
    const module = new URL(mainModule)
    const href = new URL(url).href
    module.searchParams.append('module', href)
    return this.ctx.$communicate.worker(module, {
      argv: [href, JSON.stringify(options)],
      preload: href
    }) as unknown as CommunicationService<{ Remote: RSide, Local: LSide }>
  }
}

export default WorkerService
