import type { Context } from '@krts/terminal';
import Layout from './layout.vue';

export default function (ctx: Context) {
  ctx.slot({
    type: 'layout',
    component: Layout,
    order: -1000,
  });
}
