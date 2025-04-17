export async function optimize<Fn extends Function>(fn: Fn): Promise<Fn> {
  try {
    const { optimizeNextInvocation } = await import('bun:jsc')
    // biome-ignore lint/suspicious/noExplicitAny: no explicit any
    optimizeNextInvocation(<any>fn)
  } catch {}
  return fn
}
