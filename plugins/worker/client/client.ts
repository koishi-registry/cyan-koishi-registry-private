import { CommunicationService } from "@p/communicate";
import { MessagePortCommunicator } from "@p/communicate/port"
import { type Context, Service } from "@p/core";
import Loader from '@p/loader'

declare module '@p/core' {
  export interface Context {
    $worker: WorkerClientService
  }
}

export class WorkerClientService extends Service {
  constructor(ctx: Context) {
    super(ctx, '$worker')
  }

  async ext$install(entry: string, port?: MessagePort, opt?: unknown) {
    const isolate = this.ctx.isolate('$communicate')
    if (port) isolate.plugin(CommunicationService, new MessagePortCommunicator(isolate, port))

    const plugin = await import(new URL(entry).href).then(Loader.unwrapExports).catch(error => {
      this.ctx.emit('internal/error', 'unable to load extension', error)
    })

    return [isolate.plugin(plugin, opt)] as const
  }
}
