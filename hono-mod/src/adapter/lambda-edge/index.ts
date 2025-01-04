/**
 * @module
 * Lambda@Edge Adapter for Hono.
 */

export { handle } from './handler'
export { getConnInfo } from './conninfo'
export type {
  Callback,
  CloudFrontConfig,
  CloudFrontEdgeEvent,
  CloudFrontRequest,
  CloudFrontResponse,
} from './handler'
