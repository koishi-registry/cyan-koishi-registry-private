export function cached<T>(callback: () => T): () => T {
  let result: T;
  return () => result ?? (result = callback());
}
