import fs from 'node:fs';
import type { FileInfo } from '../../types';
import { createFileInfo } from './create_fileinfo';

export async function lstat(path: string): Promise<FileInfo> {
  const lstat = await fs.promises.lstat(path);
  return createFileInfo(lstat);
}

export function lstatSync(path: string): FileInfo {
  const lstat = fs.lstatSync(path);
  return createFileInfo(lstat);
}
