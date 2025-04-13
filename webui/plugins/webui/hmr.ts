import { asPath } from "@kra/path";
import type BunWebUI from "@web/plug-webui";

export function cordisHmr(webui: BunWebUI) {
  return {
    name: 'cordis-hmr',
    transform: (code, id, _options) => {
      for (const [key, entry] of Object.entries(webui.entries)) {
        const filename = asPath(
          new URL(entry.files.entry, entry.files.base),
        );
        if (id !== filename) continue;
        code += [
          'if (import.meta.hot) {',
          '  import.meta.hot.accept(async (module) => {',
          '    const { root } = await import("@web/client");',
          `    const scope = root.$loader.entries["${key}"]?.forks["${id}"];`,
          '    return scope?.update(module, true);',
          '  });',
          '}',
          '',
        ].join('\n');
        return { code };
      }
    },
  }
}
