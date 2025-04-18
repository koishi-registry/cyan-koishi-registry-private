import type fs from "node:fs";
import type { FileInfo } from "../../types";

export function createFileInfo(lstat: fs.Stats): FileInfo {
  return {
    size: lstat.size,
    mode: lstat.mode,
    mtime: lstat.mtime,
    atime: lstat.atime,
    ctime: lstat.ctime,
    birthtime: lstat.birthtime,
    isFile: lstat.isFile(),
    isDirectory: lstat.isDirectory(),
    isSymlink: lstat.isSymbolicLink(),
    dev: lstat.dev,
    ino: lstat.ino,
    nlink: lstat.nlink,
    uid: lstat.uid,
    gid: lstat.gid,
    rdev: lstat.rdev,
    blksize: lstat.blksize,
    blocks: lstat.blocks,
    isBlockDevice: lstat.isBlockDevice(),
    isCharDevice: lstat.isCharacterDevice(),
    isFifo: lstat.isFIFO(),
    isSocket: lstat.isSocket(),
  };
}
