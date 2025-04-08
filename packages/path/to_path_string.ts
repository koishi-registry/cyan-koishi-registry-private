import { URL, fileURLToPath } from 'node:url';

export function toPathString(pathUrl: string | URL): string {
  return pathUrl instanceof URL ? fileURLToPath(pathUrl) : pathUrl;
}
