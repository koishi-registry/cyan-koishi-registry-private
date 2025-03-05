import type { SFCDescriptor, SFCScriptBlock } from "vue/compiler-sfc"
import { cache as descriptorCache } from './descriptor'
import type { ResolvedOptions } from "./mod"
import { resolveTemplateCompilerOptions } from './template'

export class ScriptCompiler {
  public clientCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>()
  public ssrCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>()

  public typeDepToSFCMap = new Map<string, Set<string>>()


  invalidateScript(filename: string): void {
    const desc = descriptorCache.get(filename)
    if (desc) {
      this.clientCache.delete(desc)
      this.ssrCache.delete(desc)
    }
  }

  getResolvedScript(
    descriptor: SFCDescriptor,
    ssr: boolean,
  ): SFCScriptBlock | null | undefined {
    return (ssr ? this.ssrCache : this.clientCache).get(descriptor)
  }

  setResolvedScript(
    descriptor: SFCDescriptor,
    script: SFCScriptBlock,
    ssr: boolean,
  ): void {
    ;(ssr ? this.ssrCache : this.clientCache).set(descriptor, script)
  }

  clearCache(): void {
    this.clientCache = new WeakMap()
    this.ssrCache = new WeakMap()
  }

  // Check if we can use compile template as inlined render function
  // inside <script setup>. This can only be done for build because
  // inlined template cannot be individually hot updated.
  isUseInlineTemplate(
    descriptor: SFCDescriptor,
    options: ResolvedOptions,
  ): boolean {
    return false
  }

  scriptIdentifier = '_sfc_main'

  resolveScript(
    descriptor: SFCDescriptor,
    options: ResolvedOptions,
    ssr: boolean,
    customElement: boolean,
  ): SFCScriptBlock | null {
    if (!descriptor.script && !descriptor.scriptSetup) {
      return null
    }

    const cached = this.getResolvedScript(descriptor, ssr)
    if (cached) {
      return cached
    }

    const resolved: SFCScriptBlock = options.compiler.compileScript(descriptor, {
      ...options.script,
      id: descriptor.id,
      isProd: !options.development,
      inlineTemplate: this.isUseInlineTemplate(descriptor, options),
      templateOptions: resolveTemplateCompilerOptions(this, descriptor, options, ssr),
      sourceMap: options.sourceMap,
      genDefaultAs: this.canInlineMain(descriptor, options)
        ? this.scriptIdentifier
        : undefined,
      customElement,
      propsDestructure:
        options.features?.propsDestructure,
    })

    if (options.development && resolved?.deps) {
      for (const [key, sfcs] of this.typeDepToSFCMap) {
        if (sfcs.has(descriptor.filename) && !resolved.deps.includes(key)) {
          sfcs.delete(descriptor.filename)
        }
      }

      for (const dep of resolved.deps) {
        const existingSet = this.typeDepToSFCMap.get(dep)
        if (!existingSet) {
          this.typeDepToSFCMap.set(dep, new Set([descriptor.filename]))
        } else {
          existingSet.add(descriptor.filename)
        }
      }
    }

    this.setResolvedScript(descriptor, resolved, ssr)
    return resolved
  }

  // If the script is js/ts and has no external src, it can be directly placed
  // in the main module. Skip for build
  canInlineMain(
    descriptor: SFCDescriptor,
    options: ResolvedOptions,
  ): boolean {
    if (descriptor.script?.src || descriptor.scriptSetup?.src)
      return false

    const lang = descriptor.script?.lang || descriptor.scriptSetup?.lang
    if (!lang || lang === 'js')
      return true

    return lang === 'ts' && options.development
  }
}
