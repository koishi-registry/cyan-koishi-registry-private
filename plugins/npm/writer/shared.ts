import type * as c from '@p/communicate'
import type { ChangeRecord, ReplicateInfo, Range } from '../types'
import type { WorkerChild } from '@plug/worker'

export interface Block {
  id: number;
  chunk: Range;
  seq: number;
  done: boolean;
}

export interface C2SRequests extends c.Requests {
}
export interface S2CRequests extends c.Requests {
  'blocks/get'(): Promise<Block[]>;
  'blocks/set'(blocks: Block[]): Promise<void>;
  'blocks/new'({ state, blockSize }: { state: number, blockSize: number }): Promise<Block>;
}
export interface C2SEvents extends c.Events {
  writes: { count: number }
}
export interface S2CEvents extends c.Events {
  records: ChangeRecord[],
  progress: {
    id: number;
    chunk: Range;
    seq: number;
  }
}


export interface C2SPackages extends c.AllPackagesOf<C2SEvents, C2SRequests> {}
export interface S2CPackages extends c.AllPackagesOf<S2CEvents, S2CRequests> {}

export type Writer = WorkerChild<C2SPackages, S2CPackages>
export type WriterRSide = c.CommunicationService<{ Remote: C2SPackages, Local: S2CPackages }>
export type WriterLSide = c.CommunicationService<{ Remote: S2CPackages, Local: C2SPackages }>
