import { type Context, Service } from '@p/core';
import { createRegExp, exactly } from 'magic-regexp';

declare module '@p/core' {
  export interface Context {
    koishi: Koishi;
  }
}

export function isKoishiPlugin(name: string): boolean {
  if (name.startsWith('@koishijs/plugin-')) return true;
  if (!name.includes('koishi-plugin-')) return false;
  if (name.startsWith('@')) {
    const [_scope, child] = name.split('/', 1);
    return child?.startsWith?.('koishi-plugin-');
  }
  return false;
}

export function shortnameOf(name: string) {
  // get shortname of a koishi plugin package
  return name.replace(
    createRegExp(
      exactly('koishi-').or(exactly('@koishijs/').at.lineStart()).grouped(),
      'plugin-',
    ),
    '',
  );
}

export class Koishi extends Service {
  constructor(ctx: Context) {
    super(ctx, 'koishi');
  }

  shortnameOf(name: string) {
    return shortnameOf(name);
  }

  isKoishiPlugin(name: string) {
    return isKoishiPlugin(name);
  }
}

export default Koishi;
