import crypto from 'node:crypto'

export function randomId() {
  return crypto.randomInt(-(2**16), 2**32)
}
