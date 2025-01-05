import { type Context, Service } from '@p/core'

declare module '@p/core' {
  export interface Context {
    koishi: Koishi
  }
}

export function isKoishiPlugin(name: string): boolean {
  if (name.startsWith('@koishijs/plugin-')) return true
  if (!name.includes('koishi-plugin-')) return false
  return !!name.match(
    /^(@[a-z0-9-~][a-z0-9-._~]*\/)?koishi-plugin-[a-z0-9-._~]*$/,
  )
}

export class Koishi extends Service {
  constructor(ctx: Context) {
    super(ctx, 'koishi')
  }

  isKoishiPlugin(name: string) {
    return isKoishiPlugin(name)
  }
}

export default Koishi
