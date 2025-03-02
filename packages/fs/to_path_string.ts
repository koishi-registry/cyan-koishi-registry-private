export function toPathString(
  pathUrl: string | URL,
): string {
  return pathUrl instanceof URL ? Bun.fileURLToPath(pathUrl) : pathUrl;
}
