import { on } from 'node:process'

on("message", (message) => {
  console.log("CHILD: received message from parent", message);
})

await import('@p/rt')
