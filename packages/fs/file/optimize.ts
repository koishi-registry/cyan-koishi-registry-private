export async function optimize<Fn extends Function>(fn: Fn): Promise<Fn> {
  // try {
    // const { optimizeNextInvocation } = await import('bun:jsc')
    // biome-ignore lint/suspicious/noExplicitAny: no explicit any
    // optimizeNextInvocation(<any>fn)
  // } catch {}
  const eager = (skip: true) => {
    if (skip) return
    const s = fn.toString()
    return fn(s)
  }
  eager(true)
  return fn
}
