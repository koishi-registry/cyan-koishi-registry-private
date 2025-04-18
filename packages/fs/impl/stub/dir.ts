export async function open(path: string) {
  throw new Error("open is not implemented in this platform")
}

export function openSync(path: string) {
  throw new Error('openSync() is not implemented in this platform')
}

export function iterate(_: unknown) {
  throw new Error("iterate() is not implemented in this platform")
}

export function iterateSync(_: unknown) {
  throw new Error('iterateSync() is not implemented in this platform')
}
