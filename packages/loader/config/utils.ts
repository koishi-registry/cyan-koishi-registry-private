import { isNullable, valueMap } from 'cosmokit';
import * as yaml from 'js-yaml';

// eslint-disable-next-line no-new-func
export const evaluate = new Function(
  'ctx',
  'expr',
  `
  with (ctx) {
    return eval(expr)
  }
`,
) as (ctx: object, expr: string) => any;

export function interpolate(ctx: object, value: any) {
  if (isJsExpr(value)) {
    return evaluate(ctx, value.__jsExpr);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolate(ctx, item));
  }
  return valueMap(value, (item) => interpolate(ctx, item));
}

function isJsExpr(value: any): value is JsExpr {
  return value instanceof Object && '__jsExpr' in value;
}

export interface JsExpr {
  __jsExpr: string;
}

export const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: (data) => typeof data === 'string',
  construct: (data) => ({ __jsExpr: data }),
  predicate: isJsExpr,
  represent: (data) => data['__jsExpr'],
});

// biome-ignore lint/suspicious/noExplicitAny: module type
export function unwrapExports(module: any) {
  if (isNullable(module)) return module;
  const exports = module.default ?? module;
  // https://github.com/evanw/esbuild/issues/2623
  // https://esbuild.github.io/content-types/#default-interop
  if (!exports.__esModule) return exports;
  return exports.default ?? exports;
}
