import { App, Component, defineComponent, h, markRaw, reactive } from 'vue'
import ActivityDefault from './activity/default.vue'
import ActivityEllipsis from './activity/ellipsis.vue'
import ActivityHome from './activity/home.vue'
import ActivityMoon from './activity/moon.vue'
import ActivitySettings from './activity/settings.vue'
import ActivitySun from './activity/sun.vue'
import ArrowUp from './svg/arrow-up.vue'
import ArrowDown from './svg/arrow-down.vue'
import ArrowLeft from './svg/arrow-left.vue'
import ArrowRight from './svg/arrow-right.vue'
import BoxOpen from './svg/box-open.vue'
import CheckFull from './svg/check-full.vue'
import ChevronDown from './svg/chevron-down.vue'
import ChevronLeft from './svg/chevron-left.vue'
import ChevronRight from './svg/chevron-right.vue'
import ChevronUp from './svg/chevron-up.vue'
import ClipboardList from './svg/clipboard-list.vue'
import Close from './svg/close.vue'
import Delete from './svg/delete.vue'
import Edit from './svg/edit.vue'
import Ellipsis from './svg/ellipsis.vue'
import ExclamationFull from './svg/exclamation-full.vue'
import Expand from './svg/expand.vue'
import External from './svg/external.vue'
import EyeSlash from './svg/eye-slash.vue'
import Eye from './svg/eye.vue'
import FileArchive from './svg/file-archive.vue'
import Filter from './svg/filter.vue'
import GitHub from './svg/github.vue'
import GitLab from './svg/gitlab.vue'
import InfoFull from './svg/info-full.vue'
import Koishi from './svg/koishi.vue'
import Link from './svg/link.vue'
import PaperPlane from './svg/paper-plane.vue'
import Add from './svg/add.vue'
import QuestionEmpty from './svg/question-empty.vue'
import Redo from './svg/redo.vue'
import Search from './svg/search.vue'
import SearchMinus from './svg/search-minus.vue'
import SearchPlus from './svg/search-plus.vue'
import StarEmpty from './svg/star-empty.vue'
import StarFull from './svg/star-full.vue'
import Start from './svg/start.vue'
import Tag from './svg/tag.vue'
import TimesFull from './svg/times-full.vue'
import Tools from './svg/tools.vue'
import Undo from './svg/undo.vue'
import User from './svg/user.vue'

import './style.scss'

const registry: Record<string, Component> = reactive({})

register('activity:default', ActivityDefault)
register('activity:ellipsis', ActivityEllipsis)
register('activity:home', ActivityHome)
register('activity:moon', ActivityMoon)
register('activity:settings', ActivitySettings)
register('activity:sun', ActivitySun)

register('arrow-up', ArrowUp)
register('arrow-down', ArrowDown)
register('arrow-left', ArrowLeft)
register('arrow-right', ArrowRight)
register('box-open', BoxOpen)
register('check-full', CheckFull)
register('chevron-down', ChevronDown)
register('chevron-left', ChevronLeft)
register('chevron-right', ChevronRight)
register('chevron-up', ChevronUp)
register('clipboard-list', ClipboardList)
register('close', Close)
register('delete', Delete)
register('edit', Edit)
register('ellipsis', Ellipsis)
register('exclamation-full', ExclamationFull)
register('expand', Expand)
register('external', External)
register('eye-slash', EyeSlash)
register('eye', Eye)
register('file-archive', FileArchive)
register('filter', Filter)
register('github', GitHub)
register('gitlab', GitLab)
register('info-full', InfoFull)
register('koishi', Koishi)
register('link', Link)
register('paper-plane', PaperPlane)
register('add', Add)
register('question-empty', QuestionEmpty)
register('redo', Redo)
register('search', Search)
register('search-minus', SearchMinus)
register('search-plus', SearchPlus)
register('star-empty', StarEmpty)
register('star-full', StarFull)
register('start', Start)
register('tag', Tag)
register('times-full', TimesFull)
register('tools', Tools)
register('undo', Undo)
register('user', User)

export function register(name: string, component: Component) {
  registry[name] = markRaw(component)
}

export function install(app: App) {
  app.component(
    'k-icon',
    defineComponent({
      props: {
        name: String,
      },
      render(props) {
        const component = registry[props.name]
        return component && h(component)
      },
    }),
  )
}
