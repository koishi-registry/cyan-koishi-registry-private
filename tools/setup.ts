import { Ask } from 'jsr:@sallai/ask';
import { parseArgs } from 'jsr:@std/cli/parse-args';
import { exists, walk } from '@std/fs';
import { join, relative, resolve } from '@std/path';
import { type SemVer, format, parse } from '@std/semver';
import { capitalize, snakeCase } from 'cosmokit';
import {
  anyOf,
  createRegExp,
  digit,
  exactly,
  maybe,
  wordChar,
} from 'magic-regexp';
import z from 'zod';
import { fromError } from 'zod-validation-error';
import mkdir = Deno.mkdir;

export type PackType = 'package' | 'plugin';
export type Scope = 'p' | 'plug';

const ask = new Ask();

function toScope(typ: PackType): Scope | null {
  if (typ === 'package') return 'p';
  if (typ === 'plugin') return 'plug';
  return null;
}

function fromScope(scope: Scope): PackType | null {
  if (scope === 'p') return 'package';
  if (scope === 'plug') return 'plugin';
  return null;
}

const regexp = createRegExp(
  maybe(exactly('@').and(wordChar.groupedAs('scope')).and('/').at.lineStart()),
  anyOf(wordChar, digit, '-')
    .and(anyOf(wordChar, digit, '-', '_').times.any())
    .groupedAs('name')
    .at.lineEnd(),
);

const VersionSchema: z.ZodType<SemVer> = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number(),
  prerelease: z.array(z.union([z.string(), z.number()])),
  build: z.array(z.string()),
});

const schema = z.object({
  webui: z.boolean().default(false),
  name: z.string().regex(regexp).nullish(),
  type: z.enum(['package', 'plugin']).nullish(),
  version: z
    .union([VersionSchema, z.string().transform((x) => parse(x))])
    .default(parse('1.0.0')),
});

const { error, data: args } = await schema.safeParseAsync(parseArgs(Deno.args));
if (error) throw fromError(error);
if (!args) throw new Error(`unreachable: args is ${args}`);

let type: PackType = args.type ?? 'plugin';

if (args.webui) throw new Error('webui template is not supported yet');
if (!args.name) {
  const { name } = await ask.input({
    name: 'name',
    message: `${capitalize(type)} Name ›`,
  } as const);
  if (!name) throw new Error('plugin name is not provided');
  args.name = z.string().regex(regexp).parse(name);
}

const nameSchema = z.object({
  scope: z.enum(['p', 'plug']).default(toScope(type)!),
  name: z.string(),
});

const matched = args.name.match(regexp);
// deno-lint-ignore no-explicit-any
const { scope, name } = await nameSchema
  .parseAsync(<any>matched!.groups)
  .catch((e) => Promise.reject(fromError(e)));
if (args.type && toScope(type) != scope)
  console.warn(
    `%cwarning%c: expected a scope of @${toScope(type)}, got @${scope}`,
    'color: yellow',
    'color: blue',
  );

type = fromScope(scope)!;

console.log(`Creating ${capitalize(fromScope(scope)!)} @${scope}/${name}`);

function interpolate(content: string): string {
  return content
    .replace('@name', name)
    .replace('@scope/name', `@${scope}/${name}`)
    .replace('@version', format(args!.version as SemVer));
}

const template_dir = resolve(import.meta.dirname!, '__template__');
const target_dir = join(resolve(Deno.cwd(), type + 's'), snakeCase(name));
if (await exists(target_dir))
  throw new Error(relative(Deno.cwd(), target_dir) + ' already exists');
for await (const entry of walk(template_dir)) {
  // if (entry.name === '__template__') continue;
  const target_path = join(target_dir, relative(template_dir, entry.path));
  if (entry.isDirectory) await mkdir(target_path, { recursive: true });
  else
    await Deno.writeTextFile(
      target_path,
      interpolate(await Deno.readTextFile(entry.path)),
      { createNew: true },
    );
}
