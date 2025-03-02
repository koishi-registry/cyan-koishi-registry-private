export interface WalkOptions {
  includeDirs: boolean;
  includeFiles: boolean;
  includeSymlinks: boolean;
  followSymlinks: boolean;
  maxDepth: number;
  exts: string[];
  match: RegExp[];
  skip: RegExp[];
}

export interface DirEntry {
  /** The file name of the entry. It is just the entity name and does not
   * include the full path. */
  name: string;
  /** True if this is info for a regular file. Mutually exclusive to
   * `DirEntry.isDirectory` and `DirEntry.isSymlink`. */
  isFile: boolean;
  /** True if this is info for a regular directory. Mutually exclusive to
   * `DirEntry.isFile` and `DirEntry.isSymlink`. */
  isDirectory: boolean;
  /** True if this is info for a symlink. Mutually exclusive to
   * `DirEntry.isFile` and `DirEntry.isDirectory`. */
  isSymlink: boolean;
}

export interface WalkEntry extends DirEntry {
  path: string
}
