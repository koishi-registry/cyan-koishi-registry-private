import type * as c from '@p/communicate'
import type { ChangeRecord, ReplicateInfo, Range } from '../types'
import type { WorkerChild } from '@plug/worker'
import type { Block } from '../writer/shared'

type Void = Record<PropertyKey, never>;

export type { Block }

// biome-ignore lint/suspicious/noConstEnum: you are fine
export const enum Stage {
  Pending = "pending",
  Prefetch = "prefetch",
  CatchUp = "catchup",
  Fetching = "fetching",
  Error = "error"
}

export interface C2SRequests extends c.Requests {
}
export interface S2CRequests extends c.Requests {
  blocks(): Block[]
  statistics(): ReplicateInfo
}
export interface C2SEvents extends c.Events {
  status: {
    stage: Stage
  };
  synchronized: Void;
  statistics: ReplicateInfo;
}
export interface S2CEvents extends c.Events {
}


export interface C2SPackages extends c.AllPackagesOf<C2SEvents, C2SRequests> {}
export interface S2CPackages extends c.AllPackagesOf<S2CEvents, S2CRequests> {}

export type Worker = WorkerChild<C2SPackages, S2CPackages>
export type WorkerRSide = c.CommunicationService<{ Remote: C2SPackages, Local: S2CPackages }>
export type WorkerLSide = c.CommunicationService<{ Remote: S2CPackages, Local: C2SPackages }>
