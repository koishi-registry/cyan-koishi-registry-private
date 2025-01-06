import { parseArgs } from "jsr:@std/cli/parse-args";
import { join, resolve, relative, dirname } from '@std/path'
import { walk, ensureDir } from '@std/fs'
import { parse, format, type SemVer } from '@std/semver'
import { createRegExp, exactly, maybe, wordChar, anyOf, digit } from 'magic-regexp'
import { capitalize, snakeCase } from 'cosmokit'
import z from 'schemastery'

export type PackType = 'package' | 'plugin'
export type Scope = 'p' | 'plug'

function toScope(typ: PackType): Scope | null {
  if (typ === 'package') return 'p'
  if (typ === 'plugin') return 'plug'
  return null
}

function fromScope(scope: Scope): PackType | null {
  if (scope === 'p') return 'package'
  if (scope === 'plug') return 'plugin'
  return null
}

const regexp = createRegExp(
  maybe(exactly('@').and(wordChar.groupedAs("scope")).and('/').at.lineStart()),
  anyOf(wordChar, digit, '-').and(anyOf(wordChar, digit, '-', '_').times.any()).groupedAs("name").at.lineEnd()
)

const VersionSchema = z.object({
  major: z.number(),
  minor: z.number(),
  patch: z.number(),
  prerelease: z.array(z.union([z.string(), z.number()])),
  build: z.array(String)
})

const schema = z.object({
  webui: z.boolean().default(false).experimental(),
  // deno-lint-ignore no-explicit-any
  name: z.string().default(null as any),
  package: z.boolean().default(false),
  version: z.union([
    VersionSchema.default('1.0.0'),
    z.transform(String, x => parse(x))
  ]).default(parse('1.0.0'))
})

const args = schema(parseArgs(Deno.args))
let type: PackType = args.package ? 'package' : 'plugin'
if (args.webui) throw new Error("webui template is not supported yet")
if (!args.name) {
  const prompted = prompt(`${capitalize(type)} Name >`)
  if (!prompted) throw new Error("plugin name is not provided")
  args.name = prompted
}

const nameSchema = z.object({
  scope: z.union(['p', 'plug']).default(toScope(type)!),
  name: z.string().required(true)
})

const matched = args.name.match(regexp)
// deno-lint-ignore no-explicit-any
const { scope, name } = nameSchema(<any>(matched!.groups))
if (toScope(type) != scope) {
  console.warn(`expected a scope of ${toScope(type)}, got ${scope}`)
  type = fromScope(scope)!
}

console.log(`Creating ${capitalize(fromScope(scope)!)} @${scope}/${name}`)

console.log(args)

function interpolate(content: string) {
  return content
    .replace('@name', name)
    .replace("@scope/name", `@${scope}/${name}`)
    .replace("@version", format(args.version as SemVer))
}

const template_dir = resolve(import.meta.dirname!, '__template__')
const target_dir = join(resolve(Deno.cwd(), type + 's'), snakeCase(name))
for await (const entry of walk(template_dir)) {
  // if (entry.name === '__template__') continue;
  const target_path = join(target_dir, relative(template_dir, entry.path))
  if (entry.isDirectory) await ensureDir(target_path)
  await ensureDir(dirname(target_path))
  await Deno.writeTextFile(
    target_path,
    interpolate(await Deno.readTextFile(entry.path))
  )
}
