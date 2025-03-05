import { rollup } from "rollup";
import { makeArray } from "cosmokit";
import yaml from "@rollup/plugin-yaml";
import vue from "@web/vue";
import type WebUI from "../core/mod";

export async function bundleEntry(webui: WebUI, entry: string | string[]) {
  await rollup({
    input: makeArray(entry),
    makeAbsoluteExternalsRelative: true,
    external: ['vue', 'vue-router', '@web/client', '@web/components'],
    plugins: [
      yaml(),
      vue({
        core: webui,
      }),
      {
        name: "cordis-hmr",
        transform: (code, id) => {
          for (const [key, { files }] of Object.entries(webui.entries)) {
            const index = webui.getPaths(files).indexOf(id);
            if (index < 0) continue;
            code += [
              "if (import.meta.hot) {",
              "  import.meta.hot.accept(async (module) => {",
              '    const { root } = await import("@web/client");',
              `    const fork = root.$loader.entries["${key}"]?.forks[${index}];`,
              "    return fork?.update(module, true);",
              "  });",
              "}",
            ].join("\n");
            code += "\n";
            return { code };
          }
        },
      },
    ],

  });
}
