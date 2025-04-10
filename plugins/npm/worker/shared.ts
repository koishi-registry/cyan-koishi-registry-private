import type * as c from '@p/communicate'
import type { ChangeRecord } from '../types'

export interface C2SRequests extends c.Requests {
  test(): void
}
export interface S2CRequests extends c.Requests {
  test(): void
}
export interface C2SEvents extends c.Events {}
export interface S2CEvents extends c.Events {
  records: ChangeRecord[]
}


export interface C2SPackages extends c.AllPackagesOf<C2SEvents, C2SRequests> {}
export interface S2CPackages extends c.AllPackagesOf<S2CEvents, S2CRequests> {}

export type WriterRSide = c.CommunicationService<{ Remote: C2SPackages, Local: S2CPackages }>
export type WriterLSide = c.CommunicationService<{ Remote: S2CPackages, Local: C2SPackages }>
