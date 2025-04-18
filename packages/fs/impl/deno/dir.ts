import type { DirEntry } from "../../types.ts"

class DenoOpendDirectory {
  constructor(public path: string) {}

  get entries() {
    return Deno.readDir(this.path)
  }

  get entriesSync() {
    return Deno.readDirSync(this.path)
  }
}

declare namespace Deno {
  function readDir(path: string | URL): AsyncIterable<DirEntry>;
  function readDirSync(path: string | URL): IteratorObject<DirEntry>;
}

export async function open(path: string) {
  return new DenoOpendDirectory(path)
}

export function openSync(path: string) {
  return new DenoOpendDirectory(path)
}

export function iterate(opend: DenoOpendDirectory) {
  return opend.entries
}

export function iterateSync(opend: DenoOpendDirectory) {
  return opend.entriesSync
}
