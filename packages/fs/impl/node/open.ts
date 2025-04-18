import fs from 'node:fs'

export function open(path: string): Promise<fs.Dir> {
  return fs.promises.opendir(path)
}

export function openSync(path: string): fs.Dir {
  return fs.opendirSync(path)
}
