import type { Context } from '@web/client';
import Page from './page.vue';

export async function hello() {
  return 'Hello from entry.ts';
}

export default async (ctx: Context) => {
  ctx.page({
    path: '/example',
    component: Page,
    name: 'Kra WebUI / Test Page',
  });
  ctx.logger.info(await hello());
};
