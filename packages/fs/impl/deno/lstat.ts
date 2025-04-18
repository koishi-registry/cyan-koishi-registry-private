import type { FileInfo } from "../../types";

declare namespace Deno {
  function lstat(path: string | URL): Promise<FileInfo>;
  function lstatSync(path: string | URL): FileInfo;
}

export async function lstat(path: string): Promise<FileInfo> {
  return await Deno.lstat(path)
}

export function lstatSync(path: string): FileInfo {
  return Deno.lstatSync(path)
}
