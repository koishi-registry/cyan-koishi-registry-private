// deno-lint-ignore no-empty-interface
export interface Koishi {}

declare module 'cordis' {
    export interface Context {
        koishi: Koishi
    }
}
