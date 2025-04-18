import fs from 'node:fs'
import type { DirEntry } from './types';
import * as impl from '@kra/fs/impl/dir';

class DirHandle implements Iterable<DirEntry>, AsyncIterable<DirEntry> {
  constructor(protected inner: impl.OpendDirectory) {}

  iterate() {
    return impl.iterate(this.inner)
  }

  iterateSync() {
    return impl.iterateSync(this.inner)
  }

  [Symbol.iterator]() {
    return this.iterateSync()[Symbol.iterator]()
  }

  [Symbol.asyncIterator]() {
    return this.iterate()[Symbol.asyncIterator]()
  }
}

export async function openDir(path: string): Promise<DirHandle> {
  return new DirHandle(await impl.open(path))
}

export function openDirSync(path: string): DirHandle {
  return new DirHandle(impl.openSync(path))
}

export async function readDir(path: string): Promise<AsyncIterable<DirEntry>> {
  const dir = await impl.open(path)
  return impl.iterate(dir)
}

export function readDirSync(path: string): Iterable<DirEntry> {
  const dir = impl.openSync(path)
  return impl.iterateSync(dir)
}
