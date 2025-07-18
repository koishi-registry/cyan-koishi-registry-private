import { crypto } from '@std/crypto'
import { Buffer } from 'node:buffer'

// Quick Digest for the win
export async function digest(content: BufferSource) {
  return Buffer.from(await crypto.subtle.digest("FNV64", content)).toString('hex')
}

// Secure Digest for the game
export async function secureDigest(content: BufferSource) {
  return Buffer.from(await crypto.subtle.digest("BLAKE3", content)).toString('base64url')
}
