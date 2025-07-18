import fs from 'node:fs'
import {Readable} from 'node:stream'
import { quansync } from 'quansync/macro'

export const readFileEncoded = quansync({
  sync: (path: string, encoding: NodeJS.BufferEncoding) => fs.readFileSync(path, { encoding }),
  async: (path: string, encoding: NodeJS.BufferEncoding) => fs.promises.readFile(path, { encoding }),
})

export const readFileBuffer = quansync({
  sync: (path: string) => fs.readFileSync(path),
  async: (path: string) => fs.promises.readFile(path)
})

export const createReadable = quansync({
  sync: (path: string) => fs.createReadStream(path),
  async: async (path: string) => fs.createReadStream(path),
})

export const exists = quansync({
  sync: (path: string) => fs.existsSync(path),
  async: async (path: string) => fs.existsSync(path),
})

export function toReadableStream(readable: fs.ReadStream) {
  return Readable.toWeb(readable)
}
