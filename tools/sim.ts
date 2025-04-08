import { Readable } from 'node:stream'
import { delay } from '@std/async'
import { Hono } from 'hono'
import { streamText } from 'hono/streaming'
import crypto from 'node:crypto';
const max = 100000;

const hono = new Hono()

interface Record {
  seq: number;
  id: string;
  changes: object[];
}

hono.get('/', (c) => c.json({
  committed_update_seq: max
}))
hono.all('/_changes', (c) => {
  const since = +(c.req.query('since')??0)
  console.log("@_changes", since)
  return streamText(c, async (stream) => {
    let counter = since;
    await stream.writeln(`{"results":[`);
    const count = crypto.randomInt(1000, 5000);
    for (let i = 0; i < count; i++) {
      if (stream.closed) break;
      const id = `this-is-a-package-${i}`
      // console.log('@serve', id)
      const content = JSON.stringify({
        seq: counter++,
        id,
        changes: [{ rev: `${since}-${counter}-abab-ef` }],
      } satisfies Record)
      await stream.writeln(`  ${content},`);
    }
    await stream.writeln(']}')
  })
})
hono.notFound((c) => {
  console.log('@notFound', c.req)
  return c.text('messsage.not.found', 404)
})

async function* streamed(since: number) {

}

export default hono
