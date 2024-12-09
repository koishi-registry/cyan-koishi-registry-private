# Koishi registry fetch app

## Install
Deno is required.
```shell
deno install
```

## Run
```shell
$ deno task start
Listening on http://0.0.0.0:8000/
```

Check http://127.0.0.1:8000/plugins,
should return currently found plugins.
(It's empty list for a while because no plugins found now, please sit and relax)

## License

The project is All rights reserved.
You are free to deploy the software on your server,
use `Context.prototype.plugin` to plug your own plugin to make modification,
without modify the original codebase.
Any monkeypatch to manipulate original plugin behaviour is not allowed (including modify prototype of classes of this project, or any ES6 builtin object).
The license includes additional restrictions:

ilharp(Individual with GitHub https://github.com/ilharp, refers as "ilharp")
is **FORBIDDEN** to deal with the software in any form (including use, copy, modify, or distribute the software).

Individual or organization related to ilharp **can not** deal with the software without explicit authorization of the project author.

You are **FORBIDDEN** to do anything that would make Deno users unable to use this app (e.g. use Node.js specified feature, or a feature not available in Deno) or use code from this project in a project that does not intended for Deno.

You are **FORBIDDEN** to port this app to Node.js or use code from this project in a project that uses Node.js.

You are FORBIDDEN to use JavaScript in this project (e.g. compile TypeScript source code to JavaScript), you should always use TypeScript in this project.

The above **MUST BE** included in the license of any forks of this project.

