import LoggerService from '@cordisjs/plugin-logger';
import TimerService from '@cordisjs/plugin-timer';
import { delay } from '@std/async';
import { ensureSymlink } from '@std/fs';
import { join, resolve } from '@std/path';
import { Context } from 'cordis';
import { noop } from 'cosmokit';
import { CommunicationService, type AllPackagesOf, type Events, type Packages, type Requests } from '@p/communicate';
import type { ChildProcessCommunicator } from '@p/communicate/child_process';
import { asPath } from '@kra/path';
import { exists } from '@kra/fs';
import { setTimeout } from 'node:timers'
import process from 'node:process'

const PING_TIMEOUT = 10000;
const AUTO_RESTART = true;

const app = new Context();

await app.plugin(TimerService);
await app.plugin(LoggerService);

// Build requirements if needed
// await Bun.$`bun tools:dkms`

await new Promise<void>((resolve) => {
  app.plugin(CommunicationService).then(resolve);
  app.setTimeout(() => resolve(), 1000);
});

interface S2CEvents extends Events {
  'exit': Record<never, never>,
}

interface S2CPackages extends AllPackagesOf<S2CEvents, Requests> {};

function createWorker() {
  const fork = app.$communicate.spawn$cp_fork(import.meta.resolve('@p/cp-rt')).cast<Packages, S2CPackages>();
  const conn = fork.conn as ChildProcessCommunicator;

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
  ];

  function shouldExit(code: number | null, signal: NodeJS.Signals | null) {
    // exit manually
    if (code === 0) return true;
    if (signals.includes(<NodeJS.Signals>signal)) return true;

    // restart manually
    if (code === 51) return false;
    if (code === 52) return true;

    // fallback to autoRestart
    return !AUTO_RESTART;
  }

  const exited = new Promise<number>(resolve => conn.getInner().on('close', code => resolve(code)))


  for (const signal of ["SIGINT", "SIGTERM", "SIGABRT"]) {
    process.on(signal, async () => {
      fork.post('exit', {});
      await Promise.any([
        delay(3000).then(() => conn.getInner().kill('SIGKILL')),
        exited
      ]);
      process.exit(0);
    });
  }

  conn.getInner().on('exit', (code, signal) => {
    if (shouldExit(code, signal)) {
      process.exit(code ?? void 0);
    }
    createWorker();
  });

  const timer = setTimeout(() => {
    app.logger.warn('daemon: ping timeout');
    conn.getInner().kill('SIGKILL');
  }, PING_TIMEOUT);

  app.setInterval(async () => {
    await fork
      .call('ping')
      .then(() => timer.refresh())
      .catch(noop);
  }, PING_TIMEOUT / 2);
}

createWorker();
