import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Binary } from 'cosmokit';
import { fileTypeFromBuffer } from 'file-type';
import type { FileResponse } from './mod.ts';

export { lookup } from 'node:dns/promises';

export async function loadFile(url: string): Promise<FileResponse | undefined> {
  if (url.startsWith('file://')) {
    const data = await readFile(fileURLToPath(url));
    const result = await fileTypeFromBuffer(data);
    return {
      type: result?.mime!,
      filename: basename(url),
      data: Binary.fromSource(data),
    };
  }
}
