import type { Activity, Dict } from '@krts/terminal';

declare module '@krts/terminal' {
  interface ActionContext {
    'theme.activity': Activity;
  }

  interface Config {
    activities: Dict<ActivityOverride>;
  }
}

interface ActivityOverride {
  hidden?: boolean;
  parent?: string;
  order?: number;
  position?: 'top' | 'bottom';
}
