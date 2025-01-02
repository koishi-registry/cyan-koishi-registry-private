import { connect, global, root } from '@web/client'
import home from './home'
import layout from './layout'
// import settings from './settings'
// import status from './status'
import styles from './styles'
import theme from './theme'
import welcome from './welcome'

import 'virtual:uno.css'
import './index.scss'

root.plugin(home)
root.plugin(layout)
// root.plugin(settings)
// root.plugin(status)
root.plugin(styles)
root.plugin(theme)
root.plugin(welcome)

if (!global.static) {
  const endpoint = new URL(global.endpoint, location.origin).toString()
  connect(root, () => new WebSocket(endpoint.replace(/^http/, 'ws')))
}
