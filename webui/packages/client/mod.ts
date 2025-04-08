// import { fileURLToPath, pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url';
import { copyFile, exists } from '@kra/fs';
import { asPath, dirname, join, resolve } from '@kra/path';
import yaml from '@maikolib/vite-plugin-yaml';
import vue from '@vitejs/plugin-vue';
import type { RollupOutput } from 'rollup';
import uno from 'unocss/preset-uno';
// import type { Context } from 'yakumo'
import unocss from 'unocss/vite';
import * as vite from 'vite';
import o from '../../../cache/vite/ui/vendors/bruh-webui-test/entry-mi7zbt9a.mjs';

// declare module 'yakumo' {
//   interface PackageConfig {
//     client?: string
//   }
// }

export async function buildEntry(
  root: string | undefined,
  entry: string,
  config: vite.UserConfig = {},
) {
  if (!(await exists(join(root || '', entry)))) return;

  const results = (await vite.build(
    vite.mergeConfig(
      {
        root,
        build: {
          minify: true,
          emptyOutDir: true,
          commonjsOptions: {
            strictRequires: true,
          },
          lib: {
            entry: entry,
            fileName: '[name]-[hash]',
            cssFileName: 'index',
            formats: ['es'],
          },
          manifest: 'manifest.json',
          rollupOptions: {
            makeAbsoluteExternalsRelative: true,
            external: ['vue', 'vue-router', '@web/client'],
            output: {
              format: 'module',
              assetFileNames: '[name]-[hash][extname]',
              hashCharacters: 'base36',
            },
          },
        },
        plugins: [
          vue(),
          yaml(),
          unocss({
            presets: [
              uno({
                preflight: false,
              }),
            ],
          }),
          {
            name: 'unocss-auto-import',
            transform(code, id, _options) {
              if (id !== entry) return;
              code = [
                'import "virtual:uno.css";',
                '',
                '',
                code
              ].join('\n')
              return { code, map: null };
            },
          },
        ],
        resolve: {
          alias: {
            'vue-i18n': '@web/client',
            '@web/components': '@web/client',
          },
        },
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        css: {
          preprocessorOptions: {
            scss: {
              api: 'modern-compiler',
            },
          },
        },
      } as vite.InlineConfig,
      config,
    ),
  )) as RollupOutput[];

  return results;
}

export interface InlineConfig extends vite.InlineConfig {}

export async function buildComponent(
  root: string,
  base: string,
  config: vite.UserConfig = {},
  isClient = false,
) {
  const { rollupOptions = {} } = config.build || {};
  return (await vite.build({
    root,
    build: {
      ...config.build,
      rollupOptions: {
        ...rollupOptions,
        makeAbsoluteExternalsRelative: true,
        external: [
          base + '/vue.js',
          base + '/vue-router.js',
          base + '/client.js',
          base + '/vueuse.js',
        ],
        output: {
          format: 'module',
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          ...rollupOptions.output,
        },
      },
    },
    plugins: [vue(), yaml(), ...(config.plugins || [])],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    resolve: {
      alias: {
        vue: base + '/vue.js',
        'vue-router': base + '/vue-router.js',
        '@vueuse/core': base + '/vueuse.js',
        '@web/client': base + '/client.js',
        ...(isClient
          ? {
              'vue-i18n': resolveModuleDist(
                'vue-i18n',
                'vue-i18n.esm-browser.prod.js',
              ),
              '@intlify/core-base': resolveModuleDist(
                '@intlify/core-base',
                'core-base.esm-browser.prod.js',
              ),
            }
          : {
              'vue-i18n': base + '/client.js',
            }),
      },
    },
  })) as RollupOutput;
}

function resolveModuleDist(id: string, dist: string) {
  return fileURLToPath(import.meta.resolve(`${id}/dist/${dist}`));
}

export async function copyComponentVue(outDir: string) {
  await copyFile(
    resolveModuleDist('vue', 'vue.runtime.esm-browser.prod.js'),
    join(outDir, 'vue.js'),
  );
}

export async function buildComponents(
  base: string,
  outDir: string,
  condSkip: Partial<{
    vue?: boolean;
    'vue-router'?: boolean;
    vueuse?: boolean;
  }> = {},
) {
  await Promise.all([
    !condSkip['vue'] && copyComponentVue(outDir),
    !condSkip['vue-router'] &&
      buildComponent(
        dirname(import.meta.resolve('vue-router/package.json')),
        base,
        {
          build: {
            outDir,
            emptyOutDir: false,
            rollupOptions: {
              input: {
                'vue-router': resolveModuleDist(
                  'vue-router',
                  'vue-router.esm-browser.js',
                ),
              },
              preserveEntrySignatures: 'strict',
            },
          },
        },
      ),
    !condSkip['vueuse'] &&
      buildComponent(dirname(import.meta.resolve('@vueuse/core')), base, {
        build: {
          outDir,
          emptyOutDir: false,
          rollupOptions: {
            input: {
              vueuse: import.meta.resolve('@vueuse/core'),
            },
            preserveEntrySignatures: 'strict',
          },
        },
      }),
  ]);
}

export async function buildClient(base: string, outDir: string) {
  await buildComponent(
    asPath(new URL('../app', import.meta.resolve('@web/client/package.json'))),
    base,
    {
      build: {
        outDir,
        emptyOutDir: false,
        chunkSizeWarningLimit: 1024 * 1024,
        rollupOptions: {
          input: {
            client: asPath(import.meta.resolve('@web/client')),
          },
          output: {
            manualChunks: {
              primevue: ['primevue', '@primevue/core', '@primevue/icons'],
              primeuix: [
                '@primeuix/themes',
                '@primeuix/styled',
                '@primeuix/styles',
                '@primeuix/utils',
              ],
            },
          },
          preserveEntrySignatures: 'strict',
        },
      },
    },
    true,
  );
}

export async function infraGen(
  base: string,
  outDir: string,
  config: InlineConfig = {},
) {
  const root = resolve(fileURLToPath(import.meta.url), '../app');

  const { rollupOptions = {} } = config.build || {};

  return (await vite.build(
    vite.mergeConfig(
      {
        root,
        base,
        plugins: [
          vue(),
          yaml(),
          unocss({
            presets: [
              uno({
                preflight: false,
              }),
            ],
          }),
        ],
        resolve: {
          dedupe: [
            'vue',
            'vue-demi',
            'vue-router',
            'primevue',
            '@vueuse/core',
            '@popperjs/core',
            '@floating-ui/vue',
            '@floating-ui/dom',
            'marked',
            'xss',
          ],
          alias: {
            vue: base + '/vue.js',
            'vue-router': base + '/vue-router.js',
            '@vueuse/core': base + '/vueuse.js',
            '@web/client': base + '/client.js',
            'vue-i18n': resolveModuleDist(
              'vue-i18n',
              'vue-i18n.esm-browser.prod.js',
            ),
            '@intlify/core-base': resolveModuleDist(
              '@intlify/core-base',
              'core-base.esm-browser.prod.js',
            ),
          },
        },
        optimizeDeps: {
          include: [
            'vue',
            'vue-router',
            'primevue',
            '@vueuse/core',
            '@popperjs/core',
            '@floating-ui/vue',
            '@floating-ui/dom',
            'marked',
            'xss',
          ],
        },
        css: {
          preprocessorOptions: {
            scss: {
              api: 'modern-compiler',
            },
          },
        },
        build: {
          ...rollupOptions,
          rollupOptions: {
            preserveEntrySignatures: 'strict',
            input: join(root, 'index.html'),
            external: [
              base + '/vue.js',
              base + '/vue-router.js',
              base + '/vueuse.js',
              base + '/client.js',
            ],
          },
          output: {
            format: 'module',
            entryFileNames: '[name].js',
            chunkFileNames: '[name].js',
            assetFileNames: '[name].[ext]',
            ...rollupOptions.output,
          },
          outDir,
        },
      } as vite.InlineConfig,
      config,
    ),
  )) as RollupOutput;
}

// export const inject = ['yakumo']

// export function apply(ctx: Context) {
//   ctx.register('client', async () => {
//     const paths = ctx.yakumo.locate(ctx.yakumo.argv._)
//     for (const path of paths) {
//       const meta = ctx.yakumo.workspaces[path]
//       const deps = {
//         ...meta.dependencies,
//         ...meta.devDependencies,
//         ...meta.peerDependencies,
//         ...meta.optionalDependencies,
//       }
//       let config: vite.UserConfig = {}
//       if (meta.yakumo?.client) {
//         const filename =
//           pathToFileURL(resolve(ctx.yakumo.cwd + path, meta.yakumo.client))
//             .href
//         const exports = (await import(filename)).default
//         if (typeof exports === 'function') {
//           await exports()
//           continue
//         }
//         config = exports
//       } else if (!deps['@web/client']) {
//         continue
//       }
//       await build(ctx.yakumo.cwd + path, config)
//     }
//   })
// }
