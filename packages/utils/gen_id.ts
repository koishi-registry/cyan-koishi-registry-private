// import crypto, { webcrypto } from 'crypto'

const buffer = new Int32Array(2)

export function randomId() {
  const buf: Int32Array = crypto.getRandomValues(buffer)
  return buf.at(Math.random() * 2)!
  // return crypto.randomInt(-(2 ** 16), 2 ** 32);
}
