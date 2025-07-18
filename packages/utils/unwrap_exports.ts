import { isNullable } from "./cosmokit.ts";

// biome-ignore lint/suspicious/noExplicitAny: module type
export function unwrapExports(module: any) {
  if (isNullable(module)) return module;
  const exports = module.default ?? module;
  // https://github.com/evanw/esbuild/issues/2623
  // https://esbuild.github.io/content-types/#default-interop
  if (!exports.__esModule) return exports;
  return exports.default ?? exports;
}
