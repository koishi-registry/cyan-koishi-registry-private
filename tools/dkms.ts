import { openDirSync } from '@kra/fs'
import { dirname, relative, resolve } from '@kra/path'
import { type } from '@kra/meta'
import { makeArray } from '@kra/utils'
import JSON5 from 'json5'
import consola from 'consola'

export const dkmsSchema = type({
  name: 'string',
  watch: type('string | string[]').pipe(x => makeArray(x)),
  script: 'string',
})
export const dkmsConf = type.or(type(dkmsSchema, '[]')).pipe(x => makeArray(x))

async function buildTask(root: string, shell: string) {
  consola.debug(`$ ${shell}`)
  return Bun.spawn({
    cmd: ['sh', '-c', shell],
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...<{}>process.env,
      PATH: `${process.env.PATH}:${resolve(process.cwd(), 'node_modules/.bin')}`
    }
  })
}

async function buildIfNeeded(meta_path: string) {
  const { default: meta } = await import(
    meta_path,
    { with: { type: 'json' } }
    )
  if (!meta.dkms) return false

  const dkms = dkmsConf.assert(meta.dkms)

  const stateFile = Bun.file(resolve(meta_path, '../.dkms.state.json5'))
  const original = await stateFile.exists().then(async exist => exist? JSON5.parse(await stateFile.text()) : {})
  const writer = stateFile.writer()
  writer.write('{')

  const tasks: ({
    root: string,
    name: string,
    script: string
  })[]= []

  const state = {}

  for (const task of dkms) {
    const globs = task.watch.map(pattern => new Bun.Glob(pattern))
    const pathIters = await Promise.all(
      globs.map(async (glob) => {
        return await glob.scan({ cwd: dirname(meta_path) });
      }),
    )
    const paths = (await Promise.all(pathIters.map(async (iter) => await Array.fromAsync(iter))))
      .flat()
      .sort()

    const hashes = Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => {
          return [
            path,
            Bun.hash.crc32(await Bun.file(resolve(dirname(meta_path), path)).arrayBuffer()),
          ];
        }),
      ),
    )

    if (!Bun.deepEquals(original?.[task.name], hashes)) tasks.push({
      name: task.name,
      root: dirname(meta_path),
      script: meta.scripts[task.script]
    })
    await writer.flush()
    writer.write(`${JSON.stringify(task.name)}: ${JSON.stringify(hashes)},`)
    state[task.name] = hashes
  }

  writer.write('}')
  await writer.end()

  await stateFile.write(JSON5.stringify(state, void 0, 2))

  for (const task of tasks) {
    consola.info(`Running task [${task.name}]`)
    const result = await buildTask(task.root, task.script)
    const exitCode = await result.exited
    if (exitCode === 0) consola.info('exited successfully')
    else consola.info(`exited with error with code ${exitCode}`)
  }

  return true
}

export async function searchPackages(directory: string, metaFile = 'package.json') {
  await Promise.all(await Array.fromAsync(openDirSync(directory))
    .then(
      entries => entries.map(entry => buildIfNeeded(resolve(directory, entry.name, metaFile)))
    )
  )
}

if (import.meta.main) {
  searchPackages('packages/')
  searchPackages('plugins/')
  // todo
}
