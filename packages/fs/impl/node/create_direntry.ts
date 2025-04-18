import { cached } from '@kra/utils'
import type fs from 'node:fs'

export function createDirEntry(dirent: fs.Dirent) {
  const isFile = cached(() => dirent!.isFile())
  const isDirectory = cached(() => dirent!.isDirectory())
  const isSymlink = cached(() => dirent!.isSymbolicLink())
  return {
    name: dirent.name,
    get isFile() {
      return isFile()
    },
    get isDirectory() {
      return isDirectory()
    },
    get isSymlink() {
      return isSymlink()
    }
  }
}
