import * as cordis from "cordis";
import { type ExecutionContext, Hono } from "hono";
import { Awaitable } from "cosmokit";
import { Router } from "./router.ts";

export interface Context {
    // deno-lint-ignore ban-types
    fetch(
        request: Request,
        env?: {},
        ctx?: ExecutionContext,
    ): Awaitable<Response>;

    hono: Hono;
}

export class Context extends cordis.Context {
    constructor() {
        super();
        this.plugin(Router);
        return Object.defineProperty(this, "fetch", {
            get() {
                return this.hono.fetch;
            },
        });
    }
}

export { Service } from 'cordis'
