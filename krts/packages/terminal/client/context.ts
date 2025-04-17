import type { ClientEvents } from '@krts/intrinsic';
import * as cordis from 'cordis';
import {
  type App,
  type Component,
  type DefineComponent,
  type InjectionKey,
  type Ref,
  createApp,
  customRef,
  defineComponent,
  h,
  inject,
  markRaw,
  onErrorCaptured,
  onScopeDispose,
  provide,
  ref,
  resolveComponent,
} from 'vue';
import ActionService from './plugins/action';
import I18nService from './plugins/i18n';
import LoaderService from './plugins/loader';
import RouterService from './plugins/router';
import SettingService from './plugins/setting';
import ThemeService from './plugins/theme';
import LoggerService from '@cordisjs/plugin-logger'

// layout api

export interface Events<C extends Context = Context>
  extends cordis.Events<C>,
    ClientEvents {}

export interface Context {
  [Context.events]: Events<this>;
  internal: Internal;
}

const kContext = Symbol('context') as InjectionKey<Context>;

export function useContext() {
  const parent = inject(kContext)!;
  const fork = parent.plugin(() => {});
  onScopeDispose(() => fork.dispose());
  return fork.ctx;
}

export function useInject<K extends string & keyof Context>(
  name: K,
): Ref<Context[K]> {
  const parent = inject(kContext)!;
  const service = ref(parent.get(name));
  onScopeDispose(
    parent.on('internal/service', () => {
      service.value = parent.get(name);
    }),
  );
  return service;
}

export function useRpc<T>(): Ref<T> {
  const parent = inject(kContext)!;
  return parent.$entry.data;
}

export interface Internal {}

export class Context extends cordis.Context {
  app: App;

  private _store: Record<string | symbol, Ref<any>> = Object.create(null);

  constructor() {
    super();
    this.internal = {} as Internal;
    this.app = createApp(
      defineComponent({
        setup: () => () => [
          h(resolveComponent('k-slot'), { name: 'root', single: true }),
          h(resolveComponent('k-slot'), { name: 'global' }),
        ],
      }),
    );
    this.app.provide(kContext, this);

    this.plugin(ActionService);
    this.plugin(I18nService);
    this.plugin(LoaderService);
    this.plugin(RouterService);
    this.plugin(SettingService);
    this.plugin(ThemeService);
    this.plugin(LoggerService)

    this.on(
      'internal/service',
      function (name) {
        // trigger
        const ref1 = this._store[this[Context.isolate][name]];
        if (ref1) ref1.value = Symbol(name);
        const ref2 = this._store[name];
        if (ref2) ref2.value = Symbol(name);
      },
      { global: true },
    );

    this.on(
      'internal/inject',
      function (name) {
        // track
        const ref = (this._store[this[Context.isolate][name] ?? name] ??=
          customRef((get, set) => ({ get, set })));
        return ref.value, false;
      },
      { prepend: true },
    );

    this.on('ready', async () => {
      await this.$loader.initTask;
      this.app.use(this.$i18n.i18n);
      this.app.use(this.$router.router);
      this.app.mount('#app');
    });
  }

  addEventListener<K extends keyof WindowEventMap>(
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ) {
    return this.effect(() => {
      globalThis.addEventListener(type, listener, options);
      return () => globalThis.removeEventListener(type, listener, options);
    });
  }

  wrapComponent(component: Component): DefineComponent;
  wrapComponent(component?: Component): DefineComponent | undefined;
  wrapComponent(component: Component) {
    if (!component) return undefined;
    if (!this.$entry) return component;
    return markRaw(
      defineComponent((props, { slots }) => {
        provide(kContext, this);
        onErrorCaptured((_e, _instance, _info) => {
          return this.scope.uid !== null;
        });
        return () => h(component, props, slots);
      }),
    );
  }
}

markRaw(cordis.Context.prototype);
markRaw(cordis.EffectScope.prototype);
