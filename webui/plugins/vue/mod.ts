import type { Plugin } from "rollup"
import { createFilter } from '@rollup/pluginutils'
import type * as _compiler from 'vue/compiler-sfc'
import type {
  SFCTemplateCompileOptions,
  SFCStyleCompileOptions,
  SFCScriptCompileOptions,
  SFCBlock
} from "vue/compiler-sfc"
import { EXPORT_HELPER_ID, helperCode } from "./helper"
import { parseVueRequest } from "./parse"
import { resolveCompiler } from './compiler'
import { computed, shallowRef } from "vue"
import type { WebUI } from '@web/core'
import { getDescriptor, getSrcDescriptor, getTempSrcDescriptor } from "./descriptor"
import { ScriptCompiler } from "./script"
import { transformTemplateAsModule } from "./template"
import { transformStyle } from "./style"
import { transformMain } from "./main"

export * from './helper'
export * from './parse'

export interface Options {
  development?: boolean
  compiler?: typeof _compiler
  include?: string | RegExp | (string | RegExp)[]
  exclude?: string | RegExp | (string | RegExp)[]
  core: WebUI
  features?: {
    propsDestructure?: boolean
    componentIdGenerator?:
          | 'filepath'
          | 'filepath-source'
          | ((
              filepath: string,
              source: string,
              isProduction: boolean | undefined,
              getHash: (text: string) => string,
            ) => string)
  }
  style?: Partial<
      Omit<
        SFCStyleCompileOptions,
        | 'filename'
        | 'id'
        | 'isProd'
        | 'source'
        | 'scoped'
        | 'cssDevSourcemap'
        | 'postcssOptions'
        | 'map'
        | 'postcssPlugins'
        | 'preprocessCustomRequire'
        | 'preprocessLang'
        | 'preprocessOptions'
      >
    >,
  script?: Partial<
      Omit<
        SFCScriptCompileOptions,
        | 'id'
        | 'isProd'
        | 'inlineTemplate'
        | 'templateOptions'
        | 'sourceMap'
        | 'genDefaultAs'
        | 'customElement'
        | 'defineModel'
        | 'propsDestructure'
      >
    >
  template?: Partial<
      Omit<
        SFCTemplateCompileOptions,
        | 'id'
        | 'source'
        | 'ast'
        | 'filename'
        | 'scoped'
        | 'slotted'
        | 'isProd'
        | 'inMap'
        | 'ssr'
        | 'ssrCssVars'
        | 'preprocessLang'
      >
    >
}

export interface ResolvedOptions extends Options {
  compiler: typeof _compiler
  development: boolean
  sourceMap: boolean
  root: string
}

export default function plugin(rawOptions: Options): Plugin<{
  version: string
}> {
  const options = shallowRef<ResolvedOptions>({
    development: true,
    // biome-ignore lint/suspicious/noExplicitAny: to be set at buildStart
    compiler: null as any,
    include: /\.vue$/,
    exclude: [],
    ...rawOptions,
    sourceMap: true,
    root: process.cwd()
  })

  const filter = computed(() =>
    createFilter(options.value.include, options.value.exclude),
  )

  const script = new ScriptCompiler()

  return {
    name: 'kra:vue',
    async resolveId(id) {
      if (id === EXPORT_HELPER_ID) return id
      if (parseVueRequest(id).query.vue) return id
    },

    async load(id) {
      if (id === EXPORT_HELPER_ID) return helperCode

      const { file, query } = parseVueRequest(id)

      if (query.vue) {
        if (options.value.development && query.src)
          return Bun.file(file).text()
        const descriptor = await getDescriptor(file, options.value)!
        let block: SFCBlock | null | undefined
        if (query.type === 'script') {
          // handle <script> + <script setup> merge via compileScript()
          block = script.resolveScript(
            descriptor,
            options.value,
            false, // ssr: false for now ig
            false,
          )
        } else if (query.type === 'template') {
          block = descriptor.template!
        } else if (query.type === 'style') {
          block = descriptor.styles[query.index!]
        } else if (query.index != null) {
          block = descriptor.customBlocks[query.index]
        }
        if (block) {
          return {
            code: block.content,
            map: block.map as any,
          }
        }
      }
    },

    async transform(code, id) {
      const { file, query } = parseVueRequest(id)

      if (query.raw || query.url) return
      if (!filter.value(file) && !query.vue) return

      if (!query.vue) { // main request
        return transformMain(
          script,
          code,
          file,
          options.value,
          this,
          false, // no ssr
          false // no custom element
        )

      }
      // sub block request
      const descriptor = query.src
        ? getSrcDescriptor(file, query) ||
          getTempSrcDescriptor(file, query)
        : await getDescriptor(file, options.value)!

      if (query.src) {
        this.addWatchFile(file)
      }

      if (query.type === 'template') {
        return transformTemplateAsModule(
          script,
          code,
          descriptor,
          options.value,
          this,
          false, // no ssr
          false // no custom element
        )
      }
      if (query.type === 'style') {
        return transformStyle(
          code,
          descriptor,
          Number(query.index || 0),
          options.value,
          this,
          file,
        )
      }
    },

    buildStart() {
      const compiler = (
        options.value.compiler || resolveCompiler(options.value.root)
      )
      if (compiler.invalidateTypeCache) {
        options.value.core.hmr.on('unlink', (file) => {
          compiler.invalidateTypeCache(file)
        })
      }
    },
  }
}
