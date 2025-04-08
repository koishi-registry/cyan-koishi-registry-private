import { URL, pathToFileURL } from 'node:url';
import { toPathString } from './to_path_string.ts';

export {
  resolve,
  join,
  dirname,
  basename,
  extname,
  relative,
} from 'node:path';

// @description: Windows sucks
export function slash(path: string): string {
  return path.replace(/\\/g, '/');
}

export function asPath(url: string | URL): string {
  return toPathString(url);
}

export function asURL(path: URL | string): URL {
  return path instanceof URL ? path : pathToFileURL(path);
}
