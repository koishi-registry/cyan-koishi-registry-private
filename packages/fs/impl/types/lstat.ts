import type { FileInfo } from "../../types";

export declare function lstat(path: string): Promise<FileInfo>;

export declare function lstatSync(path: string): FileInfo
