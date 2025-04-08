import { lstatSync, mkdirSync, readdirSync } from 'node:fs';
import * as fs from 'node:fs';
import { join, parse, resolve } from 'node:path';
import { toPathString } from './to_path_string.ts';
import type { WalkEntry, WalkOptions } from './types.ts';

export function exists(path: string | URL) {
  if (fs.existsSync) return fs.existsSync(path);
  try {
    fs.lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(path: string | URL) {
  return mkdirSync(path, { recursive: true });
}

export function walk(
  root_: string | URL,
  options?: Partial<WalkOptions>,
): Iterable<WalkEntry> {
  let {
    maxDepth = Number.POSITIVE_INFINITY,
    includeFiles = true,
    includeDirs = true,
    includeSymlinks = true,
    followSymlinks = false,
    exts = undefined,
    match = undefined,
    skip = undefined,
  } = options ?? {};

  const root = toPathString(root_);
  if (exts) {
    exts = exts.map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
  }

  return readdirSync(root)
    .map((x) => [x, lstatSync(join(root, x))] as const)
    .filter(([name, stat]) => {
      const path = resolve(root, name);
      if (skip?.some((regex) => regex.test(path))) return false;
      if (match && !match.find((regex) => regex.test(path))) return false;
      if (includeDirs && stat.isDirectory()) return true;
      if (includeFiles && stat.isFile()) return true;
      if (includeSymlinks && stat.isSymbolicLink()) return true;
      return false;
    })
    .map(([name, stat]) => {
      return {
        name: name,
        path: resolve(name),
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        isSymlink: stat.isSymbolicLink(),
      } satisfies WalkEntry;
    });
}
