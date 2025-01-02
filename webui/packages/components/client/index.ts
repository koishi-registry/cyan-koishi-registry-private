import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura';
import Button from "primevue/button"
import Panel from 'primevue/panel';
import ScrollPanel from "primevue/scrollpanel"
import Popover from 'primevue/popover';
import Tooltip from 'primevue/tooltip';


export * from '../../../../cordis/packages/schema/src/index.ts'

export default function (app: App) {
  app.use(PrimeVue, {
    theme: {
      preset: Aura
    }
  });
  app.component('Button', Button)
  app.component('Panel', Panel)
  app.component('ScrollPanel', ScrollPanel)
  app.component('Popover', Popover)
  app.directive('tooltip', Tooltip);
}
