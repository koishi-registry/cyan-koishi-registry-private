import * as fs from 'node:fs/promises';
import { copyFile, rmdir } from 'node:fs/promises';

export { rmdir, copyFile };

export async function exists(path: string | URL) {
  if (fs.exists) return fs.exists(path);
  try {
    return await fs
      .lstat(path)
      .then(() => true)
      .catch(() => false);
  } catch {
    return false;
  }
}

export async function ensureDir(path: string) {
  return fs.mkdir(path, { recursive: true });
}
