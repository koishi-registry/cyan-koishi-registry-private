import type { Context } from '@p/core';
import { Schema } from '@cordisjs/plugin-schema';
import { type Awaitable, type Dict, makeArray, Time } from 'cosmokit';
import {} from '@plug/server';
import { existsSync } from '@kra/fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import type { ViteDevServer, FileSystemServeOptions } from 'vite'
import { parse } from 'es-module-lexer';
import { Client, type Entry, type Events, WebUI } from '@web/core';
import open from 'open';
import mime from 'mime-types';
import * as http from 'node:http';
import type { StatusCode } from 'hono/utils/http-status';
import { serveStatic } from '@hono/node-server/serve-static'
import { fileURLToPath } from 'node:url';
import {
  DEP_VERSION_RE,
  injectQuery,
  isCSSRequest,
  isDirectCSSRequest,
  isDirectRequest,
  NULL_BYTE_PLACEHOLDER,
  removeImportQuery,
  removeTimestampQuery,
  stripBase,
  unwrapId
} from './helper';
import sirv from 'sirv'
import type { CustomHeader, RequestHeader } from 'hono/utils/headers';


declare module 'cordis' {
  interface EnvData {
    clientCount?: number;
  }
}

export * from '@web/core';

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
  client?: Client
}

export type Listener = (body: unknown, cx?: CallContext) => Awaitable<unknown>

class BunWebUI extends WebUI {
  static inject = ['server'];

  public vite!: ViteDevServer;
  public root: string;

  transpiler = new Bun.Transpiler({
    loader: "ts"
  })

  get baseURL() {
    return new URL(this.config.uiPath, this.ctx.server.selfUrl);
  }

  constructor(
    public override ctx: Context,
    public config: BunWebUI.Config,
  ) {
    super(ctx);

    ctx.server.sse(config.eventPath, (c) => {
      return this.accept(c);
    });

    this.root = Bun.fileURLToPath(
      new URL('./app', import.meta.resolve('@web/client/package.json')),
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
    await this.createVite();
    this.serveAssets();

    this.ctx.on('server/ready', () => {
      const target = new URL(this.config.uiPath, this.ctx.server.selfUrl);

      if (this.config.open) {
        open(target.href);
      }

      this.ctx.logger.info('webui is available at %c', target);
    });
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.ctx.server.post(`${this.config.apiPath}/${event}`, async (c) => {
      const clientId = c.req.header('X-Client-ID');
      try {
        const client = this.clients?.[clientId]
        return c.json((await (callback as Listener).call(await c.req.json(), {
          client,
          header: c.req.header()
        })) ?? {});
      } catch (error) {
        this.ctx.logger.warn(error);
        return c.text('internal server error', 500);
      }
    });
  }

  resolveEntry(files: Entry.Files, key: string) {
    return this.getPaths(files).map((path, index) => {
      // if (this.config.devMode) {
      // return `/vite/@fs/${path}`;
      // } else {
        return `${this.config.uiPath}/@vendor/${key}/${index}${extname(path)}`;
      // }
    });
  }

  private getPaths(files: Entry.Files) {
    if (this.config.devMode && files.dev) {
      const filename = Bun.fileURLToPath(new URL(files.dev, files.base));
      if (existsSync(filename)) return [filename];
    }
    return makeArray(files.prod).map((url) =>
      Bun.fileURLToPath(new URL(url, files.base)),
    );
  }

  private serveAssets() {
    const { uiPath } = this.config;

    this.ctx.server.get(uiPath + '/*', async (c, next) => {
      await next();
      if (c.res.status !== 404) return;

      // add trailing slash and redirect
      if (c.req.path === uiPath && !uiPath.endsWith('/')) {
        return c.redirect(`${c.req.path}/`);
      }

      const name = c.req.path.slice(uiPath.length).replace(/^\/+/, '');
      const sendFile = async (file: string) => {
        return c.body(Bun.file(file).readable, 200, {
          'Content-Type':
            mime.lookup(extname(file)) || 'application/octet-stream',
        });
      };

      if (name.startsWith('@vendor/')) {
        const [key, value] = name.slice(8).split('/');
        if (!this.entries[key]) return await c.notFound();
        const paths = this.getPaths(this.entries[key].files);
        const type = extname(value);
        const index = value.slice(0, -type.length);
        if (!paths[+index]) return await c.notFound();
        const file = paths[+index];
        // ctx.type = type;
        if (
          // this.config.devMode ||
          c.req.header('Content-Type') !== 'application/javascript'
        ) {
          return await sendFile(file);
        }

        const source = await Bun.file(file).text();
        return c.body(await this.transformImport(source), {
          headers: {
            'Content-Type': 'application/javascript',
          },
        });
      }

      const filename = resolve(this.root, name);
      if (
        !filename.startsWith(this.root) ||
        basename(filename).startsWith('.')
      ) {
        return c.text('Unauthorized', 403);
      }

      const exists = await Bun.file(filename).exists();
      if (exists) return sendFile(filename);
      const template = await Bun.file(resolve(this.root, 'index.html')).text();
      return c.body(await this.transformHtml(template), 200, {
        'Content-Type': 'text/html',
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
        'vue': this.config.uiPath + '/vue.js',
        'vue-router': this.config.uiPath + '/vue-router.js',
        '@web/client': this.config.uiPath + '/client.js',
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

  private async transformHtml(template_: string) {
    const { uiPath, head = [] } = this.config;
    const template = this.vite
      ? await this.vite.transformIndexHtml(uiPath, template_)
      : template_.replace(/(href|src)="(?=\/)/g, (_, $1) => `${$1}="${uiPath}`);
    let headInjection = `<script>CLIENT_CONFIG = ${JSON.stringify(
      this.createGlobal(),
    )}</script>`;
    for (const { tag, attrs = {}, content } of head) {
      const attrString = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${escapeHTML(value ?? '', true)}"`)
        .join('');
      headInjection += `<${tag}${attrString}>${content ?? ''}</${tag}>`;
    }
    return template.replace('<title>', headInjection + '<title>');
  }

  override addEntry<T>(files: Entry.Files, data?: (client: Client) => T): Entry<T> {
    const fs = this.vite.config.server.fs
    if (files.base) fs.allow.push(files.base)
    fs.allow.push(dirname(files.dev))
    fs.allow.push(...makeArray(files.prod).map(dirname))
    return super.addEntry(files, data)
  }

  private async createVite() {
    const { cacheDir, dev } = this.config;
    const { createServer } = await import('@web/client/lib');

    this.vite = await createServer(this.ctx.baseDir, {
      customLogger: this.ctx.logger('vite'),
      cacheDir: cacheDir && resolve(this.ctx.baseDir, cacheDir),
      server: {
        fs: {
          strict: dev?.fs?.strict ?? true,
          allow: dev?.fs.allow ??
            [fileURLToPath(
              new URL('../', import.meta.resolve('@web/client/lib')),
            )],
          deny: [
            cacheDir,
            ...[
              'data',
              'pair.json',
              'packages',
              'plugins/koishi_analyezr',
              'plugins/koishi_registry'
            ].map(x => join(this.ctx.baseDir, x))
          ]
        },
      },
      plugins: [{
        name: 'cordis-hmr',
        transform: (code, id, _options) => {
          for (const [key, { files }] of Object.entries(this.entries)) {
            const index = this.getPaths(files).indexOf(id)
            if (index < 0) continue
            code += [
              'if (import.meta.hot) {',
              '  import.meta.hot.accept(async (module) => {',
              '    const { root } = await import("@web/client");',
              `    const fork = root.$loader.entries["${key}"]?.forks[${index}];`,
              '    return fork?.update(module, true);',
              '  });',
              '}',
            ].join('\n') + '\n'
            return { code }
          }
        },
      }],
    })

    this.ctx.server.use('/vite/*', async (c, next) => {
      const { promise, resolve, reject } = Promise.withResolvers()
      c.env.outgoing.addListener("finish", resolve)
      c.env.outgoing.addListener("error", reject)
      this.vite.middlewares(c.env.incoming, c.env.outgoing, next)
      return promise.then(() => {
        c.finalized = true
      })
    })

    this.ctx.on('dispose', () => this.vite.close());
  }
}

namespace BunWebUI {
  export interface Dev {
    fs: FileSystemServeOptions;
  }

  export const Dev: Schema<Dev> = Schema.object({
    fs: Schema.object({
      strict: Schema.boolean().default(true),
      // deno-lint-ignore no-explicit-any
      allow: Schema.array(String).default(null as any),
      deny: Schema.array(String).default(['cache/**', '.git/**', '.env']),
    }).hidden(),
  });

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
        .default(Bun.env.DENO_ENV === 'development')
        .hidden(),
      cacheDir: Schema.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ]);
}

export default BunWebUI;
