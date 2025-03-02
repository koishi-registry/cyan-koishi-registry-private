import type { MiddlewareHandler } from "hono";
import type { ViteDevServer } from "vite";
import { isCSSRequest } from "vite";
import path from 'node:path'
import fsp from 'node:fs/promises'

const knownIgnoreList = new Set(['/', '/favicon.ico'])

const NULL_BYTE_PLACEHOLDER = '__x00__'
const trailingSeparatorRE = /[?&]$/
const timestampRE = /\bt=\d{13}&?\b/
function removeTimestampQuery(url: string): string {
  return url.replace(timestampRE, '').replace(trailingSeparatorRE, '')
}

function withTrailingSlash(path: string): string {
  if (path[path.length - 1] !== '/') {
    return `${path}/`
  }
  return path
}

const postfixRE = /[?#].*$/
export function cleanUrl(url: string): string {
  return url.replace(postfixRE, '')
}

const FS_PREFIX = '/@fs/'
const VOLUME_RE = /^[A-Z]:/i

const isWindows =
  typeof process !== 'undefined' && process.platform === 'win32'

export function normalizePath(id: string): string {
  if (isWindows) throw new Error('what is windows, do you have any idea?')
  return path.posix.normalize(id)
}

export function fsPathFromId(id: string): string {
  const fsPath = normalizePath(
    id.startsWith(FS_PREFIX) ? id.slice(FS_PREFIX.length) : id,
  )
  return fsPath[0] === '/' || VOLUME_RE.test(fsPath) ? fsPath : `/${fsPath}`
}

export function cachedTransformMiddleware(
  vite: ViteDevServer,
): MiddlewareHandler {
  const environment = this.vite.environments.client;

  return async (c, next) => {
    const ifNoneMatch = c.req.header("If-None-Match");
    if (ifNoneMatch) {
      const moduleByEtag = environment.moduleGraph.getModuleByEtag(ifNoneMatch);
      if (
        moduleByEtag?.transformResult?.etag === ifNoneMatch &&
        moduleByEtag.url === c.req.url
      ) {
        // For CSS requests, if the same CSS file is imported in a module,
        // the browser sends the request for the direct CSS request with the etag
        // from the imported CSS module. We ignore the etag in this case.
        const maybeMixedEtag = isCSSRequest(c.req.url);
        if (!maybeMixedEtag) {
          return c.status(304);
        }
      }

      await next();
    }
  };
}

export async function transformMiddleware(vite: ViteDevServer): MiddlewareHandler {

  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`

  // check if public dir is inside root dir
  const { root, publicDir } = vite.config;
  const publicDirInRoot = publicDir.startsWith(withTrailingSlash(root));
  const publicPath = `${publicDir.slice(root.length)}/`;

    return async (c, next) => {
      const environment = vite.environments.client

      if (c.req.method !== 'GET' || knownIgnoreList.has(c.req.url!)) {
        return next()
      }

      let url: string
      try {
        url = decodeURI(removeTimestampQuery(c.req.url!)).replace(
          NULL_BYTE_PLACEHOLDER,
          '\0',
        )
      } catch (e) {
        await next()
        throw e
      }

      const withoutQuery = cleanUrl(url)

      try {
        const isSourceMap = withoutQuery.endsWith('.map')
        // since we generate source map references, handle those requests here
        if (isSourceMap) {
          const depsOptimizer = environment.depsOptimizer
          if (depsOptimizer?.isOptimizedDepUrl(url)) {
            // If the browser is requesting a source map for an optimized dep, it
            // means that the dependency has already been pre-bundled and loaded
            const sourcemapPath = url.startsWith(FS_PREFIX)
              ? fsPathFromId(url)
              : normalizePath(path.resolve(vite.config.root, url.slice(1)))
            try {
              const map = JSON.parse(
                await fsp.readFile(sourcemapPath, 'utf-8'),
              ) as ExistingRawSourceMap

              applySourcemapIgnoreList(
                map,
                sourcemapPath,
                server.config.server.sourcemapIgnoreList,
                server.config.logger,
              )

              return send(req, res, JSON.stringify(map), 'json', {
                headers: server.config.server.headers,
              })
            } catch {
              // Outdated source map request for optimized deps, this isn't an error
              // but part of the normal flow when re-optimizing after missing deps
              // Send back an empty source map so the browser doesn't issue warnings
              const dummySourceMap = {
                version: 3,
                file: sourcemapPath.replace(/\.map$/, ''),
                sources: [],
                sourcesContent: [],
                names: [],
                mappings: ';;;;;;;;;',
              }
              return send(req, res, JSON.stringify(dummySourceMap), 'json', {
                cacheControl: 'no-cache',
                headers: server.config.server.headers,
              })
            }
          } else {
            const originalUrl = url.replace(/\.map($|\?)/, '$1')
            const map = (
              await environment.moduleGraph.getModuleByUrl(originalUrl)
            )?.transformResult?.map
            if (map) {
              return send(req, res, JSON.stringify(map), 'json', {
                headers: server.config.server.headers,
              })
            } else {
              return next()
            }
          }
        }

        if (publicDirInRoot && url.startsWith(publicPath)) {
          warnAboutExplicitPublicPathInUrl(url)
        }

        if (
          (rawRE.test(url) || urlRE.test(url)) &&
          !ensureServingAccess(url, server, res, next)
        ) {
          return
        }

        if (
          req.headers['sec-fetch-dest'] === 'script' ||
          isJSRequest(url) ||
          isImportRequest(url) ||
          isCSSRequest(url) ||
          isHTMLProxy(url)
        ) {
          // strip ?import
          url = removeImportQuery(url)
          // Strip valid id prefix. This is prepended to resolved Ids that are
          // not valid browser import specifiers by the importAnalysis plugin.
          url = unwrapId(url)

          // for CSS, we differentiate between normal CSS requests and imports
          if (isCSSRequest(url)) {
            if (
              req.headers.accept?.includes('text/css') &&
              !isDirectRequest(url)
            ) {
              url = injectQuery(url, 'direct')
            }

            // check if we can return 304 early for CSS requests. These aren't handled
            // by the cachedTransformMiddleware due to the browser possibly mixing the
            // etags of direct and imported CSS
            const ifNoneMatch = req.headers['if-none-match']
            if (
              ifNoneMatch &&
              (await environment.moduleGraph.getModuleByUrl(url))?.transformResult
                ?.etag === ifNoneMatch
            ) {
              debugCache?.(`[304] ${prettifyUrl(url, server.config.root)}`)
              res.statusCode = 304
              return res.end()
            }
          }

          // resolve, load and transform using the plugin container
          const result = await transformRequest(environment, url, {
            html: req.headers.accept?.includes('text/html'),
          })
          if (result) {
            const depsOptimizer = environment.depsOptimizer
            const type = isDirectCSSRequest(url) ? 'css' : 'js'
            const isDep =
              DEP_VERSION_RE.test(url) || depsOptimizer?.isOptimizedDepUrl(url)
            return send(req, res, result.code, type, {
              etag: result.etag,
              // allow browser to cache npm deps!
              cacheControl: isDep ? 'max-age=31536000,immutable' : 'no-cache',
              headers: server.config.server.headers,
              map: result.map,
            })
          }
        }
      } catch (e) {
        if (e?.code === ERR_OPTIMIZE_DEPS_PROCESSING_ERROR) {
          // Skip if response has already been sent
          if (!res.writableEnded) {
            res.statusCode = 504 // status code request timeout
            res.statusMessage = 'Optimize Deps Processing Error'
            res.end()
          }
          // This timeout is unexpected
          server.config.logger.error(e.message)
          return
        }
        if (e?.code === ERR_OUTDATED_OPTIMIZED_DEP) {
          // Skip if response has already been sent
          if (!res.writableEnded) {
            res.statusCode = 504 // status code request timeout
            res.statusMessage = 'Outdated Optimize Dep'
            res.end()
          }
          // We don't need to log an error in this case, the request
          // is outdated because new dependencies were discovered and
          // the new pre-bundle dependencies have changed.
          // A full-page reload has been issued, and these old requests
          // can't be properly fulfilled. This isn't an unexpected
          // error but a normal part of the missing deps discovery flow
          return
        }
        if (e?.code === ERR_CLOSED_SERVER) {
          // Skip if response has already been sent
          if (!res.writableEnded) {
            res.statusCode = 504 // status code request timeout
            res.statusMessage = 'Outdated Request'
            res.end()
          }
          // We don't need to log an error in this case, the request
          // is outdated because new dependencies were discovered and
          // the new pre-bundle dependencies have changed.
          // A full-page reload has been issued, and these old requests
          // can't be properly fulfilled. This isn't an unexpected
          // error but a normal part of the missing deps discovery flow
          return
        }
        if (e?.code === ERR_FILE_NOT_FOUND_IN_OPTIMIZED_DEP_DIR) {
          // Skip if response has already been sent
          if (!res.writableEnded) {
            res.statusCode = 404
            res.end()
          }
          server.config.logger.warn(colors.yellow(e.message))
          return
        }
        if (e?.code === ERR_LOAD_URL) {
          // Let other middleware handle if we can't load the url via transformRequest
          return next()
        }
        return next(e)
      }

      next()
    }

    function warnAboutExplicitPublicPathInUrl(url: string) {
      let warning: string

      if (isImportRequest(url)) {
        const rawUrl = removeImportQuery(url)
        if (urlRE.test(url)) {
          warning =
            `Assets in the public directory are served at the root path.\n` +
            `Instead of ${colors.cyan(rawUrl)}, use ${colors.cyan(
              rawUrl.replace(publicPath, '/'),
            )}.`
        } else {
          warning =
            'Assets in public directory cannot be imported from JavaScript.\n' +
            `If you intend to import that asset, put the file in the src directory, and use ${colors.cyan(
              rawUrl.replace(publicPath, '/src/'),
            )} instead of ${colors.cyan(rawUrl)}.\n` +
            `If you intend to use the URL of that asset, use ${colors.cyan(
              injectQuery(rawUrl.replace(publicPath, '/'), 'url'),
            )}.`
        }
      } else {
        warning =
          `Files in the public directory are served at the root path.\n` +
          `Instead of ${colors.cyan(url)}, use ${colors.cyan(
            url.replace(publicPath, '/'),
          )}.`
      }

      server.config.logger.warn(colors.yellow(warning))
    }
}
