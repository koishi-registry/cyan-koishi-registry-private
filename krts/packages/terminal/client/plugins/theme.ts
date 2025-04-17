import { usePreferredDark } from '@vueuse/core';
import { Schema } from '@krts/components';
import type { Dict } from 'cosmokit';
import { type Component, computed, markRaw, reactive, watchEffect } from 'vue';
import type { Context } from '../context';
import { Service } from '../utils';
import { useConfig } from './setting';

declare module '../context' {
  interface Context {
    $theme: ThemeService;

    theme(options: ThemeOptions): () => void;
  }

  interface Internal {
    themes: Dict<ThemeOptions>;
  }
}

declare module '../index' {
  interface Config {
    theme: Config.Theme;
  }

  export namespace Config {
    export interface Theme {
      mode: 'auto' | 'dark' | 'light';
      dark: string;
      light: string;
    }
  }
}

export interface ThemeOptions {
  id: string;
  name: string | Dict<string>;
  components?: Dict<Component>;
}

const preferDark = usePreferredDark();

const config = useConfig();

const colorMode = computed(() => {
  const mode = config.value.theme.mode;
  if (mode !== 'auto') return mode;
  return preferDark.value ? 'dark' : 'light';
});

export const useColorMode = () => colorMode;

export default class ThemeService extends Service {
  constructor(ctx: Context) {
    super(ctx, '$theme');
    ctx.mixin('$theme', ['theme']);

    ctx.internal.themes = reactive({});

    ctx.settings({
      id: 'appearance',
      title: '外观设置',
      order: 900,
      schema: Schema.object({
        theme: Schema.object({
          mode: Schema.union([
            Schema.const('auto').description('跟随系统'),
            Schema.const('dark').description('深色'),
            Schema.const('light').description('浅色'),
          ])
            .default('auto')
            .description('主题偏好。'),
          dark: Schema.string()
            .role('theme', { mode: 'dark' })
            .default('default-dark')
            .description('深色主题。'),
          light: Schema.string()
            .role('theme', { mode: 'light' })
            .default('default-light')
            .description('浅色主题。'),
        }).description('主题设置'),
      }),
    });

    ctx.effect(() =>
      watchEffect(
        () => {
          if (!config.value.theme) return;
          const root = globalThis.document.querySelector('html')!;
          root.setAttribute('theme', config.value.theme[colorMode.value]);
          if (colorMode.value === 'dark') {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }
        },
        { flush: 'post' },
      ),
    );
  }

  theme(options: ThemeOptions) {
    markRaw(options);
    for (const [type, component] of Object.entries(options.components || {})) {
      this.ctx.slot({
        type,
        disabled: () => config.value.theme[colorMode.value] !== options.id,
        component,
      });
    }
    return this.ctx.effect(() => {
      this.ctx.internal.themes[options.id] = options;
      return () => delete this.ctx.internal.themes[options.id];
    });
  }
}
