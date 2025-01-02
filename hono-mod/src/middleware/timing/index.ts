import type { TimingVariables } from './timing'
export { TimingVariables }
export { endTime, setMetric, startTime, timing } from './timing'

declare module '../..' {
  interface ContextVariableMap extends TimingVariables {}
}
