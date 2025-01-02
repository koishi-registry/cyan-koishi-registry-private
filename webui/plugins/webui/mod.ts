import type { Context } from 'cordis'
import { Schema } from '@cordisjs/plugin-schema'
import { type Dict, makeArray, noop, Time } from 'cosmokit'
import {} from '@plug/server'
import type { FileSystemServeOptions, ViteDevServer } from 'vite'
import { existsSync } from '@std/fs'
import { basename, extname, fromFileUrl, resolve } from '@std/path'
import { parse } from 'es-module-lexer'
import { type Entry, type Events, WebUI } from './shared/mod.ts'
import { open } from 'https://deno.land/x/open@v1.0.0/index.ts'
import mime from 'mime-types'
import * as http from 'node:http'
import type { StatusCode } from 'hono/utils/http-status'
import { fileURLToPath } from "node:url";

declare module 'cordis' {
  interface EnvData {
    clientCount?: number
  }
}

export * from './shared/mod.ts'

function escapeHTML(source: string, inline = false) {
  const result = (source ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return inline ? result.replace(/"/g, '&quot;') : result
}

export interface ClientConfig {
  devMode: boolean
  uiPath: string
  endpoint: string
  static?: boolean
  heartbeat?: HeartbeatConfig
  proxyBase?: string
}

interface HeartbeatConfig {
  interval?: number
  timeout?: number
}

class DenoWebUI extends WebUI {
  static inject = ['server']

  public vite!: ViteDevServer
  public root: string

  constructor(public override ctx: Context, public config: DenoWebUI.Config) {
    super(ctx)

    ctx.server.ws(config.apiPath, (socket, wsContext) => {
      this.accept(socket, wsContext)
    })

    this.root = fromFileUrl(
      new URL('./app', import.meta.resolve('@web/client/deno.json')),
    )
  }

  createGlobal() {
    const global = {} as ClientConfig
    const { devMode, uiPath, apiPath, selfUrl, heartbeat } = this.config
    global.devMode = devMode
    global.uiPath = uiPath
    global.heartbeat = heartbeat
    global.endpoint = selfUrl + apiPath
    const proxy = this.ctx.get('server.proxy')
    if (proxy) global.proxyBase = proxy.config.path + '/'
    return global
  }

  override async start() {
    await this.createVite()
    this.serveAssets()

    this.ctx.on('server/ready', () => {
      const target = this.ctx.server.selfUrl + this.config.uiPath

      if (this.config.open) {
        open(target)
      }

      this.ctx.logger.info('webui is available at %c', target)
    })
  }

  addListener<K extends keyof Events>(event: K, callback: Events[K]) {
    this.ctx.server.post(`${this.config.apiPath}/${event}`, async (c) => {
      const { body, header } = c
      try {
        return c.json(await (callback as Function).call(header, body) ?? {})
      } catch (error) {
        this.ctx.logger.warn(error)
        return c.text('Internal server error', 500)
      }
    })
  }

  resolveEntry(files: Entry.Files, _key: string) {
    return this.getPaths(files).map((path, _index) => {
      // if (this.config.devMode) {
      return `/vite/@fs/${path}`
      // } else {
      //   return `${this.config.uiPath}/@vendor/${key}/${index}${extname(path)}`;
      // }
    })
  }

  private getPaths(files: Entry.Files) {
    if (this.config.devMode && files.dev) {
      const filename = fromFileUrl(new URL(files.dev, files.base))
      if (existsSync(filename)) return [filename]
    }
    return makeArray(files.prod).map((url) =>
      fromFileUrl(new URL(url, files.base))
    )
  }

  private serveAssets() {
    const { uiPath } = this.config

    this.ctx.server.get(uiPath + '/*', async (c, next) => {
      await next()
      if (c.res.status !== 404) return

      // add trailing slash and redirect
      if (c.req.path === uiPath && !uiPath.endsWith('/')) {
        return c.redirect(c.req.path + '/')
      }

      const name = c.req.path.slice(uiPath.length).replace(/^\/+/, '')
      const sendFile = async (filename: string) => {
        return c.body(
          await Deno.open(filename, { read: true }).then((handle) =>
            handle.readable
          ),
          200,
          {
            'Content-Type': mime.lookup(extname(filename)) ||
              'application/octet-stream',
          },
        )
      }

      if (name.startsWith('@vendor/')) {
        const [key, value] = name.slice(8).split('/')
        if (!this.entries[key]) return await c.notFound()
        const paths = this.getPaths(this.entries[key].files)
        const type = extname(value)
        const index = value.slice(0, -type.length)
        if (!paths[+index]) return await c.notFound()
        const filename = paths[+index]
        // ctx.type = type;
        if (
          // this.config.devMode ||
          c.req.header('Content-Type') !== 'application/javascript'
        ) {
          return await sendFile(filename)
        }

        const source = await Deno.readTextFile(filename)
        return c.body(await this.transformImport(source), {
          'headers': {
            'Content-Type': 'application/javascript',
          },
        })
      }

      const filename = resolve(this.root, name)
      if (
        !filename.startsWith(this.root) || basename(filename).startsWith('.')
      ) {
        return c.text('Unauthorized', 403)
      }

      const stats = await Deno.stat(filename).catch<Deno.FileInfo>(noop)
      if (stats?.isFile) return sendFile(filename)
      const template = await Deno.readTextFile(
        resolve(this.root, 'index.html'),
      )
      return c.body(await this.transformHtml(template), 200, {
        'Content-Type': 'text/html',
      })
    })
  }

  private resolveImport(name?: string) {
    if (!name) {
      this.ctx.logger.warn('cannot transform dynamic import names')
      return name
    }
    return ({
      'vue': this.config.uiPath + '/vue.js',
      'vue-router': this.config.uiPath + '/vue-router.js',
      '@web/client': this.config.uiPath + '/client.js',
    })[name] ?? name
  }

  private async transformImport(source: string) {
    let output = '', lastIndex = 0
    const [imports] = parse(source)
    for (const { s, e, n } of imports) {
      output += source.slice(lastIndex, s) + this.resolveImport(n)
      lastIndex = e
    }
    return output + source.slice(lastIndex)
  }

  private async transformHtml(template: string) {
    const { uiPath, head = [] } = this.config
    if (this.vite) {
      template = await this.vite.transformIndexHtml(uiPath, template)
    } else {
      template = template.replace(
        /(href|src)="(?=\/)/g,
        (_, $1) => `${$1}="${uiPath}`,
      )
    }
    let headInjection = `<script>CLIENT_CONFIG = ${
      JSON.stringify(this.createGlobal())
    }</script>`
    for (const { tag, attrs = {}, content } of head) {
      const attrString = Object.entries(attrs).map(([key, value]) =>
        ` ${key}="${escapeHTML(value ?? '', true)}"`
      ).join('')
      headInjection += `<${tag}${attrString}>${content ?? ''}</${tag}>`
    }
    return template.replace('<title>', headInjection + '<title>')
  }

  private async createVite() {
    const { cacheDir, dev } = this.config
    const { createServer } = await import('@web/client/lib')

    this.vite = await createServer(this.ctx.baseDir, {
      cacheDir: cacheDir && resolve(this.ctx.baseDir, cacheDir),
      server: {
        fs: {
          strict: dev?.fs?.strict ?? true,
          allow: dev?.fs.allow ?? [fileURLToPath(new URL('../', import.meta.resolve('@web/client/lib')))],
          deny: (dev?.fs?.deny ?? []).map(path => resolve(this.ctx.info.baseDir, path))
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

    this.ctx.server.all('/vite/*', async (c, next) => {
      return await new Promise((resolve) => { // the who-knows magic to fake a connect style middleware environment
        // deno-lint-ignore no-explicit-any
        const req = new http.IncomingMessage(null as any)
        // deno-lint-ignore no-explicit-any
        const res = new (http.ServerResponse as any)((resp: Response) =>
          resolve(
            c.body(
              resp.body,
              res.statusCode as StatusCode,
              Object.fromEntries(resp.headers.entries()),
            ),
          )
        )
        req.method = c.req.method
        req.url = c.req.path
        req.headers = Object.fromEntries(c.req.raw.headers.entries())
        this.vite.middlewares(req, res, next)
      })
    })

    this.ctx.on('dispose', () => this.vite.close())
  }
}

namespace DenoWebUI {
  export interface Dev {
    fs: FileSystemServeOptions
  }

  export const Dev: Schema<Dev> = Schema.object({
    fs: Schema.object({
      strict: Schema.boolean().default(true),
      // deno-lint-ignore no-explicit-any
      allow: Schema.array(String).default(null as any),
      deny: Schema.array(String).default(['cache/**', '.git/**', '.env']),
    }).hidden(),
  })

  export interface Head {
    tag: string
    attrs?: Dict<string>
    content?: string
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
  ])

  export interface Config {
    uiPath: string
    devMode: boolean
    cacheDir?: string
    open?: boolean
    head?: Head[]
    selfUrl: string
    apiPath: string
    heartbeat?: HeartbeatConfig
    dev?: Dev
  }

  export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
      uiPath: Schema.string().default('/ui'),
      apiPath: Schema.string().default('/api'),
      selfUrl: Schema.string().role('link').default(''),
      open: Schema.boolean(),
      head: Schema.array(Head),
      heartbeat: Schema.object({
        interval: Schema.number().default(Time.second * 30),
        timeout: Schema.number().default(Time.minute),
      }),
      devMode: Schema.boolean().default(
        Deno.env.get('DENO_ENV') === 'development',
      )
        .hidden(),
      cacheDir: Schema.string().default('cache/vite').hidden(),
      dev: Dev,
    }),
  ])
}

export default DenoWebUI
