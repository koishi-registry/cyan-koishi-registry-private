export type Range = [number, number];

export function chunksIter(
  range: [number, number],
  chunkSize: number,
): [number, Generator<[number, number]>] {
  const size = range[1] - range[0];

  const params = { cause: new Error(Bun.inspect({ range, chunkSize })) };
  if (!chunkSize)
    throw new TypeError('Chunk size must be an integer >= 0', params);

  if (Number.isNaN(size))
    throw new TypeError('Invalid Range (%.size is not a number (NaN))', params);
  if (size < 0)
    throw new TypeError('Invalid Range (range[0] > range[1])', params);

  let start = range[0];
  const count = Math.ceil(size / chunkSize);

  function* gen() {
    while (start < range[1]) {
      const end = Math.min(start + chunkSize, range[1]);
      yield [start, end] as [number, number];
      start = end;
    }
  }

  return [count, gen()];
}

export function take<T>(iterable: Iterable<T>, num: number): T[] {
  const result: T[] = [];
  const iterator = iterable[Symbol.iterator]();
  for (let i = 0; i < num; i++) {
    const next = iterator.next();
    if (next.done) break;
    result.push(next.value);
  }
  return result;
}
