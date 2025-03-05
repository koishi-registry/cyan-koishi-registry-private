import { type Context, useConfig } from '@web/client';
import App from './index.vue';

export default function (ctx: Context) {
  ctx.slot({
    type: 'root',
    component: App,
    order: -1000,
  });

  const router = ctx.$router.router;

  const config = useConfig();

  ctx.action('theme.activity.settings', {
    action: () => router.push('/settings/activity'),
  });

  ctx.action('theme.activity.reset', {
    action: () => (config.value.activities = {}),
  });

  ctx.menu('theme.activity', [
    {
      //   id: '.settings',
      //   label: '活动栏设置',
      // }, {
      id: '.reset',
      label: '重置活动栏',
    },
  ]);
}
