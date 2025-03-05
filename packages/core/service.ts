import * as cordis from 'cordis';
import type { Context } from './context.ts';

export abstract class Service<
  C extends Context = Context,
> extends cordis.Service<C> {
  protected declare ctx: C;
}
