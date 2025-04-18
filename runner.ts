import LoggerService from '@cordisjs/plugin-logger';
import TimerService from '@cordisjs/plugin-timer';
import { delay } from '@std/async';
import { ensureSymlink } from '@std/fs';
import { join, resolve } from '@std/path';
import { Context } from 'cordis';
import { noop } from 'cosmokit';
import type BunIPCCommunicator from './packages/communicate/communicator/bun_ipc.ts';
import { CommunicationService } from './packages/communicate/mod.ts';
import { asPath } from '@kra/path';
import { exists } from '@kra/fs';

const PING_TIMEOUT = 10000;
const AUTO_RESTART = true;

const app = new Context();

await app.plugin(TimerService);
await app.plugin(LoggerService);

// Build requirements if needed
await Bun.$`bun tools:dkms`

await new Promise<void>((resolve) => {
  app.plugin(CommunicationService).then(resolve);
  app.setTimeout(() => resolve(), 1000);
});

function createWorker() {
  const fork = app.$communicate.spawn();
  const conn = fork.conn as BunIPCCommunicator;

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

  for (const signal of signals) {
    process.on(signal, async () => {
      await fork.post('exit', {});
      await Promise.any([
        Bun.sleep(3000).then(() => conn.getInner().kill('SIGKILL')),
        conn.getInner().exited,
      ]);
      process.exit(0);
    });
  }

  conn.on('exit', (code, signal) => {
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
