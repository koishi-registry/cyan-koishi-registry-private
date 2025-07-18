import * as http from 'node:http';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from '@cordisjs/plugin-schema';
import { serveStatic } from '@hono/node-server/serve-static';
import * as fs from '@kra/fs';
import { File } from '@kra/fs/file'
import { crypto } from '@std/crypto';
import { match } from '@kra/meta';
import { asPath, asURL } from '@kra/path';
import { noop } from '@kra/utils';
import type { Context } from '@p/core';
import {} from '@plug/server';
import { buildComponents } from '@krts/terminal/lib';
import {
  type Client,
  type Entry,
  type Events,
  type Manifest,
  KratIntrinsic,
} from '@krts/intrinsic';
import { type Awaitable, type Dict, Time, makeArray } from 'cosmokit';
import { parse } from 'es-module-lexer';
import type { CustomHeader, RequestHeader } from 'hono/utils/headers';
import type { StatusCode } from 'hono/utils/http-status';
import mime from 'mime-types';
import open from 'npm:open';
import type { OutputAsset } from 'rolldown';
import { UIPaths as InstrinsicPaths } from './paths.ts';
import { cordisHmr } from './hmr.ts';
import { etag } from 'hono/etag';
import { digest, secureDigest } from "./digest.ts";

declare module 'cordis' {
  interface EnvData {
    clientCount?: number;
  }
}

export * from '@krts/intrinsic';

function escapeHTML(source: string, inline = false) {
  const result = (source ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return inline ? result.replace(/"/g, '&quot;') : result;
}

export interface ClientConfig {
  devMode: boolean;
  uiPath: string;
  endpoint: string;
  events: string;
  static?: boolean;
  heartbeat?: HeartbeatConfig;
  proxyBase?: string;
}

interface HeartbeatConfig {
  interval?: number;
  timeout?: number;
}

export interface CallContext {
  headers: Record<RequestHeader | (string & CustomHeader), string>;
  client?: Client;
}

export type Listener = (body: unknown, cx?: CallContext) => Awaitable<unknown>;

export interface State {
  buildTime: number;
  versions: {
    '@krts/terminal': string;
    vue: string;
    'vue-router': string;
    '@vueuse/core': string;
  };
}

export const DEFAULT_STATE: State = {
  buildTime: new Date(0).getTime(),
  versions: {
    '@krts/terminal': '0.0.0',
    vue: '0.0.0',
    'vue-router': '0.0.0',
    '@vueuse/core': '0.0.0',
  },
};

function ensureTrailingSlash(url: URL) {
  if (!url.pathname.endsWith('/'))
    url.pathname += '/';
  return url
}

class DenoKrat extends KratIntrinsic {
  static inject = ['server'];

  public infra!: Promise<void>;
  public terminalScript!: Promise<File>;
  public readonly paths: InstrinsicPaths;

  get baseURL() {
    return new URL(this.config.uiPath, this.ctx.server.selfUrl);
  }

  constructor(
    public override ctx: Context,
    public config: DenoKrat.Config,
  ) {
    super(ctx);

    ctx.server.sse(config.eventPath, (c) => {
      return this.accept(c);
    });

    this.paths = new InstrinsicPaths(
      ctx,
      this.config.cacheDir || join(ctx.cacheDir, 'vite'),
    );
  }

  createGlobal() {
    const global = {} as ClientConfig;
    const { devMode, uiPath, apiPath, eventPath, heartbeat } = this.config;
    global.devMode = devMode;
    global.uiPath = uiPath;
    global.heartbeat = heartbeat;
    global.endpoint = apiPath;
    global.events = eventPath;
    const proxy = this.ctx.get('server.proxy');
    if (proxy) global.proxyBase = proxy.config.path + '/';
    return global;
  }

  override async start() {
    await this.paths.ensureDir();
    const prepare = this.prepare();
    await prepare.next();
    this.serveAssets();
    await prepare.next();

    this.ctx.on('server/ready', async () => {
      const target = new URL(this.config.uiPath, this.ctx.server.selfUrl);

      await prepare.next();

      if (this.config.open) {
        open(target.href);
      }

      this.ctx.logger.info('webui is available at %c', target);
    });
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.ctx.server.post(`${this.config.apiPath}/${event}`, async (c) => {
      const clientId = c.req.header('X-Client-ID');
      if (!clientId) return c.text('X-Client-ID is not set', 400);
      try {
        const client = this.clients?.[clientId];
        return c.json(
          (await (callback as Listener).call(await c.req.json(), {
            client,
            header: c.req.header(),
          })) ?? {},
        );
      } catch (error) {
        this.ctx.logger.warn(error);
        return c.text('internal server error', 500);
      }
    });
  }

  async resolveEntry(entry: Entry) {
    if (this.config.devMode) {
      const url = new URL(
        entry.files.entry,
        entry.files.base && ensureTrailingSlash(asURL(entry.files.base))
      );
      if (await fs.exists(url))
        return [
          `${this.config.uiPath}/@vendor/${entry.id}/${entry.files.entry}`,
          `${this.config.uiPath}/@vendor/${entry.id}/style.css`,
        ];
      throw new Error(
        `could not resolve entry '${entry.id}', as the entry file does not exists`,
      );
    }
    const result = await entry.executeOnceFallible(
      'compile',
      () => false as const,
    );
    if (result === false || typeof result === 'undefined')
      throw new Error(`could not compile entry-${entry.id}`);
    return Object.values(result).map(
      (chunk, key) =>
        `${this.config.uiPath}/@vendor/${entry.id}/${key}/${chunk.file}`,
    );
  }

  private serveAssets() {
    const { uiPath } = this.config;

    this.ctx.server.get(`${uiPath}/terminal.js`, etag(), async (c) => {
      const script = await this.terminalScript
      return c.body(script.readable, {
        headers: {
          "Content-Type": "text/javascript",
          ...this.config.devMode ? {} : {
            'Cache-Control': 'public, max-age=36000'
          }
        }
      })
    })

    this.ctx.server.get(`${uiPath}/*`, async (c, next) => {
      await next();
      if (c.res.status !== 404) return;

      // add trailing slash and redirect
      if (c.req.path === uiPath && !uiPath.endsWith('/')) {
        return c.redirect(`${c.req.path}/`);
      }

      const name = c.req.path.slice(uiPath.length).replace(/^\/+/, '');
      const sendServerAssets = async (file: string, cacheControl?: string) => {
        const content = await Deno.readFile(file)

        const hash = await secureDigest(content);
        const eTag = `"${this.id}@${hash}"`; // include the server id in the ETag

        if (c.req.header('If-None-Match') === eTag)
          return c.body('Not Modified', /* Not Modified */ 304, {
            'ETag': eTag
          })
        return c.body(content, 200, {
          'Content-Type':
            mime.lookup(extname(file)) || 'application/octet-stream',
          'ETag': eTag,
          ...cacheControl ? { 'Cache-Control': cacheControl } : {}
        });
      };
      const sendFile = async (file: string, cacheControl?: string) => {
        const content = await Deno.readFile(file)

        const hash = await secureDigest(content);
        const eTag = `"${hash}"`;

        if (c.req.header('If-None-Match') === eTag)
          return c.body('Not Modified', /* Not Modified */ 304, {
            'ETag': eTag
          })
        return c.body(content, 200, {
          'Content-Type':
            mime.lookup(extname(file)) || 'application/octet-stream',
          'ETag': eTag,
          ...cacheControl ? { 'Cache-Control': cacheControl } : {}
        });
      };

      if (name.startsWith('@vendor/')) {
        const [key, value, tag] = name.slice(8).split('/', 3);
        if (!this.entries[key]) return await c.notFound();
        const entry = this.entries[key];
        const paths = await this.resolveEntry(entry);
        const type = extname(tag || value);
        const index = value;
        if (this.config.devMode) { // try to compile
          const manifest = await entry.executeOnce('compile')
          if (manifest)
            for (const chunkName in manifest) {
              const chunk = manifest[chunkName]
              if (chunk.src === name.slice(8).slice(key.length + 1)) {
                const source = await File.path(this.paths.entryVendor(key), chunk.file).text()
                return c.body(await this.transformImport(source), 200, {
                  'Content-Type': mime.lookup(extname(chunk.file)) || 'text/plain'
                })
              }
            }
        }
        if (!paths[+index]) return c.notFound();
        if (!paths[+index].startsWith(c.req.path)) return c.notFound();
        const file = join(this.paths.entryVendor(entry.id), tag || value);
        // ctx.type = type;
        if (
          // this.config.devMode ||
          mime.lookup(type) !== 'application/javascript' &&
          c.req.header('content-type') !== 'application/javascript'
        ) {
          return await sendFile(file);
        }

        const source = await Deno.readTextFile(file);
        const hash = digest(source)
        const eTag = `"${hash}"`
        if (c.req.header('If-None-Match') === eTag) return c.body('Not Modified', /* Not Modified */ 304, {
          'ETag': eTag
        })
        return c.body(await this.transformImport(source), 200, {
          'Content-Type': 'text/javascript',
          'ETag': eTag
        });
      }

      await this.infra;
      const filename = resolve(this.paths.infra, name);
      if (
        !filename.startsWith(resolve(this.paths.infra)) ||
        basename(filename).startsWith('.')
      ) {
        return c.notFound();
      }

      const exists = await fs.exists(filename);
      const serve = (name.startsWith('assets') ? sendServerAssets : sendFile)

      if (exists) return serve(
        filename,
        this.config.devMode ? 'max-age=60' : 'public, max-age=3600, stale-while-revalidate=600'
      );

      const eTag = `"${this.id}@${await digest(Object.values(this.config).toString())}"`
      if (c.req.header('If-None-Match') === eTag) return c.body('Not Modified', /* Not Modified */ 304, {
        'ETag': eTag
      })
      const template = await File.path(
        this.paths.infra, 'index.html',
      ).text();
      return c.html(this.transformHtml(template), 200, {
        'Content-Type': 'text/html',
        'ETag': eTag,
        ... this.config.devMode ? {} : { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }
      });
    });
  }

  private resolveImport(name?: string) {
    if (!name) {
      this.ctx.logger.warn('cannot transform dynamic import names');
      return name;
    }
    return (
      {
        vue: this.config.uiPath + '/vue.js',
        'vue-router': this.config.uiPath + '/vue-router.js',
        '@krts/terminal': this.config.uiPath + '/terminal.js',
      }[name] ?? name
    );
  }

  private async transformImport(source: string) {
    let output = '';
    let lastIndex = 0;
    const [imports] = parse(source);
    for (const { s, e, n } of imports) {
      output += source.slice(lastIndex, s) + this.resolveImport(n);
      lastIndex = e;
    }
    return output + source.slice(lastIndex);
  }

  private async transformHtml(template: string) {
    const { uiPath, head = [] } = this.config;

    // const template = template_.replace(/(href|src)="(?=\/)/g, (_, $1) => `${$1}="${uiPath}`);
    let headInjection = `<script>CLIENT_CONFIG = ${JSON.stringify(
      this.createGlobal(),
    )}</script>`;
    for (const { tag, attrs = {}, content } of head) {
      const attrString = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${escapeHTML(value ?? '', true)}"`)
        .join('');
      headInjection += `<${tag}${attrString}>${content ?? ''}</${tag}>`;
    }
    return template.replace('<title>', `${headInjection}<title>`);
  }

  async compileEntry(entry: Entry) {
    const { devMode } = this.config;
    const { buildEntry } = await import('@krts/terminal/lib');
    const files = entry.files;
    const results = await buildEntry(files.base && asPath(files.base), files.entry, {
      build: {
        minify: !devMode,
        sourcemap: devMode,
        outDir: resolve(this.paths.entryVendor(entry.id)),
      },
    });

    if (!results) return {};

    const manifestAsset: OutputAsset = <OutputAsset>(
      results[0].output.find(
        (x) =>
          x.type === 'asset' &&
          x.fileName === 'manifest.json' &&
          !x.originalFileNames.length,
      )
    );
    const manifest: Manifest =
      manifestAsset && JSON.parse(<string>manifestAsset.source);

    if (entry.temporal)
      this.ctx.effect(
        () => () => fs.rmdir(this.paths.entryVendor(entry.id)),
      );

    if (!manifest) throw new TypeError('could not locate manifest.json');

    return manifest;
  }

  override addEntry<T>(
    files: Entry.Info,
    data?: (client: Client) => T,
  ): Entry<T> {
    const entry = super.addEntry(files, data);
    entry.defTask('compile', async () => {
      return await this.compileEntry(entry);
    });
    return entry;
  }

  private async *prepare() {
    const { cacheDir, devMode, uiPath } = this.config;
    const { infraGen, buildEndTerminal } = await import('@krts/terminal/lib');

    const versions = {
      '@krts/terminal':
        (await import('@krts/terminal/deno.json', { with: { type: 'json' } })).version +
        (devMode ? '-dev' : ''),
      vue: (await import(import.meta.resolve('vue/package.json'), { with: { type: "json" } })).version,
      'vue-router': (await import(import.meta.resolve('vue-router/package.json'), { with: { type: "json" } })).version,
      '@vueuse/core': (
        await import(import.meta.resolve('@vueuse/core/package.json'), { with: { type: "json" } })
      ).version,
    };

    const stateFile = File.path(this.paths.infra, 'state.json');
    const state: State = await match({
      true: async () => <State>await stateFile.json(),
      false: async () => DEFAULT_STATE,
      default: (v) => {
        throw new TypeError(`unreachable: expect boolean, got ${typeof v}`);
      },
    })(await stateFile.exists());

    const base = uiPath;
    const outDir = resolve(this.paths.infra);

    const component = buildComponents(base, outDir, {
      vue: versions['vue'] === state.versions['vue'],
      'vue-router': versions['vue-router'] === state.versions['vue-router'],
      vueuse: versions['@vueuse/core'] === state.versions['@vueuse/core'],
    });

    const scriptFile = File.path(this.paths.infra, 'terminal.js')
    if (this.config.devMode || versions['@krts/terminal'] !== state.versions['@krts/terminal']) {
      this.infra = infraGen(base, outDir, {
        cacheDir: cacheDir && resolve(this.ctx.baseDir, cacheDir),
        base: this.config.uiPath,
        build: {
          minify: !devMode,
          emptyOutDir: false,
        },
        plugins: [cordisHmr(this)],
      }).then(noop)
      this.terminalScript = buildEndTerminal(this.config.uiPath, outDir)
        .then(() => scriptFile)
    } else {
      this.terminalScript = scriptFile
        .exists()
        .then(exist => {
          if (exist) return scriptFile
          return buildEndTerminal(this.config.uiPath, outDir)
            .then(() => scriptFile)
        })
      this.infra = Promise.resolve()
    }

    await stateFile.write(
      JSON.stringify(
        {
          buildTime: new Date().getTime(),
          versions,
        } satisfies State,
        null,
        2,
      ),
    );

    yield;

    await Promise.all([this.infra, this.terminalScript, component]);
    yield;

    // this.ctx.on('dispose', () => this.vite.close());
  }
}

namespace DenoKrat {
  export interface Dev {}

  export const Dev: Schema<Dev> = Schema.object({});

  export interface Head {
    tag: string;
    attrs?: Dict<string>;
    content?: string;
  }

  export const Head: Schema<Head> = Schema.intersect([
    Schema.object({
      tag: Schema.union([
        'title',
        'link',
        'meta',
        'script',
        'style',
        Schema.string(),
      ]).required(),
    }),
    Schema.union([
      Schema.object({
        tag: Schema.const('title').required(),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('link').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('meta').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
      }),
      Schema.object({
        tag: Schema.const('script').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.const('style').required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
      Schema.object({
        tag: Schema.string().required(),
        attrs: Schema.dict(Schema.string()).role('table'),
        content: Schema.string().role('textarea'),
      }),
    ]),
  ]);

  export interface Config {
    uiPath: string;
    devMode: boolean;
    cacheDir?: string;
    open?: boolean;
    head?: Head[];
    selfUrl: string;
    eventPath: string;
    apiPath: string;
    heartbeat?: HeartbeatConfig;
    dev?: Dev;
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      uiPath: Schema.string().default('/ui'),
      eventPath: Schema.string().default('/events'),
      apiPath: Schema.string().default('/api'),
      selfUrl: Schema.string().role('link').default(''),
      open: Schema.boolean(),
      head: Schema.array(Head),
      heartbeat: Schema.object({
        interval: Schema.number().default(Time.minute),
        timeout: Schema.number().default(Time.minute),
      }),
      devMode: Schema.boolean()
        .default(Deno.env.get('DENO_ENV') === 'development')
        .hidden(),
      cacheDir: Schema.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ]);
}

export default DenoKrat;
