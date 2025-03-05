import { mkdir, stat } from 'node:fs/promises';

export async function ensureDir(path: string) {
  return mkdir(path, { recursive: true });
}
