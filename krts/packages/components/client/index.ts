import Aura from '@primeuix/themes/aura';
import Button from 'primevue/button';
import PrimeVue from 'primevue/config';
import Panel from 'primevue/panel';
import Popover from 'primevue/popover';
import ScrollPanel from 'primevue/scrollpanel';
import Tooltip from 'primevue/tooltip';
import type { App } from 'vue';

export * from '@cordisjs/plugin-schema';

export default function (app: App) {
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
    },
  });
  app.component('Button', Button);
  app.component('Panel', Panel);
  app.component('ScrollPanel', ScrollPanel);
  app.component('Popover', Popover);
  app.directive('tooltip', Tooltip);
}
