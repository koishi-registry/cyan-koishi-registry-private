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
  oneOrMore,
  wordChar,
} from 'magic-regexp';
import { type } from '@kra/meta'
import { consola } from 'consola';
import mkdir = Deno.mkdir;

export type PackType = 'package' | 'plugin';
export type Scope = 'p' | 'plug';

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
  maybe(exactly('@').and(oneOrMore(wordChar).groupedAs('scope')).and('/').at.lineStart()),
  anyOf(wordChar, digit, '-')
    .and(anyOf(wordChar, digit, '-', '_').times.any())
    .groupedAs('name')
    .at.lineEnd(),
);

const SemVerSchema: type<SemVer> = type({
  major: "number",
  minor: "number",
  patch: "number",
  prerelease: '(string | number)[]',
  build: 'string[]',
});
const VersionSchema = type.or(SemVerSchema, type.string.pipe(s => parse(s)));

const schema = type({
  webui: type('boolean').default(false),
  'name?': "string | null",
  'type?': "'package' | 'plugin' | null",
  version: SemVerSchema.default(() => VersionSchema.assert('1.0.0')),
});

const args = schema.assert(parseArgs(Deno.args));
if (!args) throw new Error(`unreachable: args is ${args}`);

if (!args.type) {
  args.type = await consola.prompt(`Type ›`, {
      required: true,
      type: 'select',
      options: ['plugin', 'package'] satisfies PackType[],
    })
}

let packType: PackType = args.type ?? 'plugin';

if (!args.name) {
  const name = await consola.prompt(`${capitalize(packType)} Name ›`, {
    required: true,
    type: 'text',
  })
  args.name = type(new RegExp(regexp)).assert(name);
}

const nameSchema = type({
  scope: type("'p' | 'plug' | undefined").pipe(scope => scope ?? toScope(args.type)!),
  name: "string",
});

const matched = args.name.match(regexp);
// deno-lint-ignore no-explicit-any
const { scope, name } = nameSchema
  .assert(matched!.groups)
if (args.type && toScope(packType) !== scope)
  consola.warn(
    `expected a scope of @${toScope(packType)}, got @${scope}`
  );

packType = fromScope(scope)!;

consola.info(`Creating ${capitalize(packType)} @${scope}/${name}`);

function interpolate(content: string): string {
  return content
    .replace('@name', name)
    .replace('@scope/name', `@${scope}/${name}`)
    .replace('@version', format(args!.version as SemVer));
}

const template_dir = resolve(import.meta.dirname!, args.webui ? '__template_webui__' : '__template__');
const target_dir = join(resolve(Deno.cwd(), packType + 's'), snakeCase(name));
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
