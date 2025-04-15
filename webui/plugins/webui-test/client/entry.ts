import type { Context } from '@web/client';
import Page from './page.vue';

export async function hello() {
  return 'Hello from entry.ts';
}

export const inject = ['logger']

export async function apply(ctx: Context) {
  ctx.page({
    path: '/example',
    component: Page,
    name: 'Kra WebUI / Test Page',
  });
  ctx.logger.info(await hello());
};
