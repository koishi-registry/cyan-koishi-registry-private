import type { Context } from '@krts/terminal';
import Page from './page.vue';

export async function hello() {
  return 'Hello from entry.ts';
}

export const name = 'demo-mod'
export const inject = ['logger']

export async function apply(ctx: Context) {
  ctx.page({
    path: '/ui/example',
    component: Page,
    name: 'Greetings',
  });
  ctx.logger.info(await hello());
};
