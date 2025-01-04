/**
 * @module
 * AWS Lambda Adapter for Hono.
 */

export { handle, streamHandle } from './handler'
export type { APIGatewayProxyResult, LambdaEvent } from './handler'
export type {
  ALBRequestContext,
  ApiGatewayRequestContext,
  ApiGatewayRequestContextV2,
  LambdaContext,
} from './types'
