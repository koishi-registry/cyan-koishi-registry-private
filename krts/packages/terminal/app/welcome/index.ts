import type { Context } from '@krts/terminal';
import Welcome from './welcome.vue';

export default function (ctx: Context) {
  ctx.slot({
    type: 'home',
    component: Welcome,
  });
}
