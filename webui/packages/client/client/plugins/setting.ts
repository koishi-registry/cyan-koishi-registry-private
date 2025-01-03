import { Schema } from '@cordisjs/plugin-schema'
import { Context } from '../context'
import { insert, Ordered, Service } from '../utils'
import { Dict, remove } from 'cosmokit'
import { Component, computed, markRaw, reactive, ref, watch } from 'vue'
import { Config } from '..'
import { RemovableRef, useLocalStorage } from '@vueuse/core'

// declare module '@cordisjs/schema' {
//   interface SchemaService {
//     component(extension: SchemaBase.Extension): () => void
//   }
// }

declare module '../context' {
  interface Context {
    $setting: SettingService
    settings(options: SettingOptions): () => void
  }

  interface Internal {
    settings: Dict<SettingOptions[]>
  }
}

interface SettingOptions extends Ordered {
  id: string
  title?: string
  disabled?: () => boolean
  schema?: Schema
  component?: Component
}

export let useStorage = function useStorage<T extends object>(
  key: string,
  version?: number,
  fallback?: () => T,
): RemovableRef<T> {
  const initial = fallback ? fallback() : {} as T
  ;(initial as { __version__?: number })['__version__'] = version
  const storage = useLocalStorage('cordis.webui.' + key, initial)
  if ((storage as { __version__?: number })['__version__'] !== version) {
    storage.value = initial
  }
  return storage
}

export function provideStorage(factory: typeof useStorage) {
  useStorage = factory
}

export const original = useStorage<Config>('config', undefined, () => ({
  theme: {
    mode: 'auto',
    dark: 'default-dark',
    light: 'default-light',
  },
  locale: 'zh-CN',
}))

export const resolved = ref({} as Config)

export const useConfig = (useOriginal = false) =>
  useOriginal ? original : resolved

export default class SettingService extends Service {
  constructor(ctx: Context) {
    super(ctx, '$setting')
    ctx.mixin('$setting', {
      settings: 'settings',
      extendSchema: 'schema',
    })

    ctx.internal.settings = reactive({})

    this.settings({
      id: '',
      title: '通用设置',
      order: 1000,
      schema: Schema.object({
        locale: Schema.union(['zh-CN', 'en-US']).description('语言设置。'),
      }).description('通用设置'),
    })

    const schema = computed(() => {
      const list: Schema[] = []
      for (const settings of Object.values(ctx.internal.settings)) {
        for (const options of settings) {
          if (options.schema) {
            list.push(options.schema)
          }
        }
      }
      return Schema.intersect(list)
    })

    const doWatch = () =>
      watch(resolved, (value) => {
        console.debug('config', value)
        original.value = schema.value.simplify(value)
      }, { deep: true })

    let stop = doWatch()

    const update = () => {
      stop?.()
      try {
        resolved.value = schema.value(original.value)
      } catch (error) {
        console.error(error)
      }
      stop = doWatch()
    }

    ctx.effect(() => () => stop?.())

    ctx.effect(() => watch(original, update, { deep: true }))
    ctx.effect(() => watch(schema, update))
  }

  // extendSchema(extension: SchemaBase.Extension) {
  //   extension.component = this.ctx.wrapComponent(extension.component)
  //   return this.ctx.effect(() => {
  //     SchemaBase.extensions.add(extension)
  //     return () => SchemaBase.extensions.delete(extension)
  //   })
  // }

  settings(options: SettingOptions) {
    markRaw(options)
    options.order ??= 0
    options.component = this.ctx.wrapComponent(options.component)
    return this.ctx.effect(() => {
      const list = this.ctx.internal.settings[options.id] ||= []
      insert(list, options)
      return () => {
        remove(list, options)
        if (!list.length) delete this.ctx.internal.settings[options.id]
      }
    })
  }
}
