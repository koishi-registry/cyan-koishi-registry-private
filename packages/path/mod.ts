// @description: Windows sucks
export function slash(path: string): string {
  return path.replace(/\\/g, '/');
}
