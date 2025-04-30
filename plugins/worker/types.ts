import type { CommunicationService, Packages } from "@p/communicate";

export interface MasterPackages extends Packages {}
export interface ClientPackages extends Packages {}

export type SignalMaster = CommunicationService<{ Remote: MasterPackages, Local: ClientPackages }>;
export type SignalClient = CommunicationService<{ Remote: ClientPackages, Local: MasterPackages }>;
