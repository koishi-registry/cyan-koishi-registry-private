import type fs from 'node:fs'
import { createDirEntry } from './create_direntry'

export async function* iterate(dir: fs.Dir) {
  let dirent: fs.Dirent | null
  while ((dirent = await dir.read()) != null)
    yield createDirEntry(dirent)
}

export function* iterateSync(dir: fs.Dir) {
  let dirent: fs.Dirent | null
  while ((dirent = dir.readSync()) != null)
    yield createDirEntry(dirent)
}
