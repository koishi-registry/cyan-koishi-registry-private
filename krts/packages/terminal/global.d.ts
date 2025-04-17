/// <reference types="vue-i18n" />
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { Component } from 'vue';

  const component: Component;
  export default component;
}

declare module '*.yaml' {
  const content: {};
  export default content;
}

declare module '*.yml' {
  const content: {};
  export default content;
}
