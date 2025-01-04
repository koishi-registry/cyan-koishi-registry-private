import type { JwtVariables } from './jwt'
export type { JwtVariables }
export { decode, jwt, sign, verify } from './jwt'
import type {} from '../..'

declare module '../..' {
  interface ContextVariableMap extends JwtVariables {}
}
