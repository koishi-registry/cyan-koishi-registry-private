import type { Activity, Dict } from '@web/client'

declare module 'web/client' {
  interface ActionContext {
    'theme.activity': Activity
  }

  interface Config {
    activities: Dict<ActivityOverride>
  }
}

interface ActivityOverride {
  hidden?: boolean
  parent?: string
  order?: number
  position?: 'top' | 'bottom'
}
