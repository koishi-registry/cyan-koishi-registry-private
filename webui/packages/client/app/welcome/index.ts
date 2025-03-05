import type { Context } from '@web/client';
import Welcome from './welcome.vue';

export default function (ctx: Context) {
  ctx.slot({
    type: 'home',
    component: Welcome,
  });
}
