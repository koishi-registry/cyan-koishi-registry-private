/**
 * @module
 *
 * Hono - Web Framework built on Web Standards
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * const app = new Hono()
 *
 * app.get('/', (c) => c.text('Hono!'))
 *
 * export default app
 * ```
 */

import { Hono } from './hono'

/**
 * Types for environment variables, error handlers, handlers, middleware handlers, and more.
 */
export type {
  Env,
  ErrorHandler,
  Handler,
  Input,
  MiddlewareHandler,
  Next,
  NotFoundHandler,
  Schema,
  ToSchema,
  TypedResponse,
  ValidationTargets,
} from './types'
/**
 * Types for context, context variable map, context renderer, and execution context.
 */
export type {
  Context,
  ContextRenderer,
  ContextVariableMap,
  ExecutionContext,
} from './context'
/**
 * Type for HonoRequest.
 */
export type { HonoRequest } from './request'
/**
 * Types for inferring request and response types and client request options.
 */
export type {
  ClientRequestOptions,
  InferRequestType,
  InferResponseType,
} from './client'

/**
 * Hono framework for building web applications.
 */
export { Hono }
