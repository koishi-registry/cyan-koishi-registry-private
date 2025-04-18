import type { DirEntry } from "../../types"

export const kType: unique symbol = Symbol.for('kra.fs.impl.type')

export const kOpenDirectory: unique symbol = Symbol.for('kra.fs.impl.directory')

export declare class OpendDirectory {
  [kType]: typeof kOpenDirectory
}

export declare function open(path: string): Promise<OpendDirectory>;
export declare function iterate(directory: OpendDirectory): AsyncIterable<DirEntry>;

export declare function openSync(path: string): OpendDirectory;
export declare function iterateSync(directory: OpendDirectory): Iterable<DirEntry>;
