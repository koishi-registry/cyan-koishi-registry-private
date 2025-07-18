export async function asyncMapValues<T, U>(
  obj: Record<string, T>,
  callback: (value: T, key: string) => Promise<U>,
): Promise<Record<string, U>> {
  const tasks = Object.entries(obj).map(async ([key, value]) => [
    key,
    await callback(value, key),
  ]);

  const result: Record<string, U> = Object.fromEntries(
    await Promise.all(tasks),
  );
  return result;
}

export { mapValues } from './cosmokit.ts';
