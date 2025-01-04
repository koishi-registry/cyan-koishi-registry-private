/**
 * @module
 * SSG Helper for Hono.
 */

export * from './ssg'
export {
  disableSSG,
  isSSGContext,
  onlySSG,
  ssgParams,
  X_HONO_DISABLE_SSG_HEADER_KEY,
} from './middleware'
