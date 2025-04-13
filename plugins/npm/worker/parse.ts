import { TextLineStream } from '@std/streams';
import { TextDecoderStream } from 'node:stream/web'
import type { Awaitable } from 'cosmokit';
import trim from 'lodash.trim';
import type { ChangeRecord } from './types';

export interface ParserOptions {
  signal?: AbortSignal;
  intercept?: (seq: number) => Awaitable<boolean>;
}

export async function* parseStream(
  stream: ReadableStream<Uint8Array>,
  { signal, intercept }: ParserOptions,
): AsyncIterable<ChangeRecord[]> {
  const decoder = new TextDecoderStream();
  const reader = stream
    .pipeThrough(decoder, { signal })
    .pipeThrough(new TextLineStream(), { signal })
    .getReader();
  let last = 0;
  while (!signal || !signal.aborted) {
    const result = await reader.read();
    if (result.done) break;

    const { value: data } = result;

    const records: ChangeRecord[] = data
      .split('\n')
      .map((data) => trim(data, ','))
      .filter(Boolean)
      .flatMap((data) => {
        try {
          return [JSON.parse(data)];
        } catch {
          return [];
        }
      });

    if (records.length > 0) {
      last = records[records.length - 1].seq;

      const brk = yield records;

      if (brk) break;
      if (intercept && (await intercept(last))) break;
    }
  }
  reader.cancel();
  reader.releaseLock();
}
