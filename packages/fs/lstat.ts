import { toPathString } from "./to_path_string.ts";
import * as impl from '@kra/fs/impl/lstat'

export function lstat(path_: string | URL) {
  const path = toPathString(path_)
  return impl.lstat(path)
}

export function lstatSync(path_: string | URL) {
  const path = toPathString(path_)
  return impl.lstatSync(path)
}
