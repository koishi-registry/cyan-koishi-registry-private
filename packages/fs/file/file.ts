import { quansync } from 'quansync/macro'
import * as q from './qbits'

import { optimize } from './optimize'
import { toArrayBuffer, toBlob } from '@std/streams'
import { exists } from 'node:fs/promises'
import { join } from '@kra/path'

export class File {
  static {
    // biome-ignore lint/complexity/noThisInStatic: i don't think so
    // biome-ignore lint/complexity/noUselessThisAlias: who cares
    const self = this
    for (const prop of Reflect.ownKeys(self)) {
      if (typeof self[prop] === 'function') optimize(self[prop])
    }
    optimize(self.path)
    optimize(self.joinPath)
  }

  constructor(public path: string) {

  }

  private $q$exists = quansync(async () => {
    return await q.exists(this.path)
  })

  async exists() {
    return await q.exists.async(this.path)
  }

  existsSync() {
    return q.exists.sync(this.path)
  }

  static joinPath(...paths: string[]) {
    return join(...paths)
  }

  static path(...paths: string[]) {
    if (!paths.length) throw new TypeError("expect arguments to have non-zero length")
    // biome-ignore lint/complexity/noThisInStatic: i don't think so
    return new this(File.joinPath(...paths))
  }

  private $q$readFileEncoded = quansync(async (encoding?: BufferEncoding) => {
    return await q.readFileEncoded(this.path, encoding || 'utf-8')
  })
  private $q$readFileBuffered = quansync(async () => {
    return await q.readFileBuffer(this.path)
  })

  async readFile(encoding?: BufferEncoding) {
    if (encoding) return await this.$q$readFileEncoded.async(encoding)
    return await this.$q$readFileBuffered.async()
  }

  async text() {
    const data = await this.readFile()
    return data.toString()
  }

  async blob() {
    return toBlob(this.readable)
  }

  async arrayBuffer() {
    return toArrayBuffer(this.readable)
  }

  async buffer() {
    return this.$q$readFileBuffered.async()
  }

  readFileSync(encoding?: BufferEncoding) {
    if (encoding) return this.$q$readFileEncoded.sync(encoding)
    return this.$q$readFileBuffered.sync()
  }

  get readable() {
    return q.toReadableStream(q.createReadable.sync(this.path))
  }
}
