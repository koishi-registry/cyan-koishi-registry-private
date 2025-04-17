import components from '@krts/components';
import Markdown from 'marked-vue';
import type { App } from 'vue';

import common from './common';
import * as icons from './icons';
import layout from './layout';
import link from './link';
import slot from './slot';

// export const loading = ElLoading.service
// export const message = ElMessage
// export const messageBox = ElMessageBox

export * from './common';
export * from './layout';
export * from './link';
export * from './slot';

export * from 'vue-i18n';
export * from '@krts/components';

export { icons };

export default function (app: App) {
  app.component('k-markdown', Markdown);

  app.use(common);
  app.use(components);
  app.use(icons);
  app.use(layout);
  app.use(link);
  app.use(slot);
}
