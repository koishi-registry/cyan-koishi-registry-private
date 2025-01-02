import { fork } from 'node:child_process'

import { run } from "https://deno.land/x/proc@0.22.1/mod.ts";
await run(Deno.execPath(), 'i', '--node-modules-dir=auto').toStdout()
Deno.execPath()

fork

export const worker = new Worker(import.meta.resolve('@p/worker-rt'), {
  type: "module",
})


worker.onmessage = (event) => {
  console.log(event)
}

