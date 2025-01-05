import { Context } from 'cordis'
import { delay } from '@std/async'
import { ensureSymlink } from '@std/fs'
import { resolve, join } from '@std/path'
import TimerService from '@cordisjs/plugin-timer'
import LoggerService from '@cordisjs/plugin-logger'
import { run } from 'https://deno.land/x/proc@0.22.1/mod.ts'
import { CommunicationService } from './packages/communicate/mod.ts'
import { ChildProcess } from 'node:child_process'
import { noop } from 'cosmokit'

// This make sure Vite is happy.
await run(Deno.execPath(), 'i', '--node-modules-dir=auto').toStdout()

const PING_TIMEOUT = 10000
const AUTO_RESTART = true

const app = new Context()

await app.plugin(TimerService)
await app.plugin(LoggerService)

async function linkPackage(meta_path: string) {
  const { default: meta } = await import(
    meta_path,
    { with: { type: 'json' } }
    )
  if (!meta.name) return false

  await ensureSymlink(
    Deno.lstatSync(meta_path).isDirectory ? meta_path : join(meta_path, ".."),
    resolve('node_modules/', meta.name),
  ).catch(noop)
  return true
}

export async function linkPackagesFrom(directory: string, metaFile: string = 'deno.json') {
  await Promise.all(await Array.fromAsync(Deno.readDir(directory))
    .then(
      entries => entries.map(entry => linkPackage(resolve(directory, entry.name, metaFile)))
    )
  )
}

await linkPackagesFrom('packages/')
await linkPackagesFrom('plugins/')
await linkPackagesFrom(join("webui/packages"))
await linkPackagesFrom(join("webui/plugins"))
await linkPackagesFrom('cordis/packages', 'package.json')

await new Promise<void>((resolve) => {
  app.plugin(CommunicationService).then(resolve)
  app.setTimeout(() => resolve(), 1000)
})

function createWorker() {
  const fork = app.$communicate.fork()
  const cp = fork.conn.getInner() as ChildProcess

  // https://github.com/koishijs/koishi/blob/master/packages/koishi/src/cli/start.ts#L76
  // https://nodejs.org/api/process.html#signal-events
  // https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/signal
  const signals: NodeJS.Signals[] = [
    'SIGABRT',
    'SIGBREAK',
    'SIGBUS',
    'SIGFPE',
    'SIGHUP',
    'SIGILL',
    'SIGINT',
    'SIGKILL',
    'SIGSEGV',
    'SIGSTOP',
    'SIGTERM',
  ]

  function shouldExit(code: number | null, signal: NodeJS.Signals | null) {
    // exit manually
    if (code === 0) return true
    if (signals.includes(<NodeJS.Signals> signal)) return true

    // restart manually
    if (code === 51) return false
    if (code === 52) return true

    // fallback to autoRestart
    return !AUTO_RESTART
  }

  cp.on('exit', (code, signal) => {
    if (shouldExit(code, signal)) {
      Deno.exit(code ?? void 0)
    }
    createWorker()
  })

  let dispose: (() => void) | null = app.setInterval(async () => {
    const promise = new Promise((resolve) => {
      fork.call('ping')
        .then(resolve)
        .catch(noop)
    })
    if (await Promise.any([promise, delay(PING_TIMEOUT).then(() => true)])) {
      if (dispose) {
        return dispose(), dispose = null
      }
      app.logger.warn('daemon: ping timeout')
      cp.kill('SIGILL')
    }
  }, PING_TIMEOUT / 2)
}

createWorker()
