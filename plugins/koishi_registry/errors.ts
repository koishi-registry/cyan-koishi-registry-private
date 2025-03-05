export class SyncError extends Error {
  constructor(
    public code: SyncError.Code,
    message?: string,
  ) {
    super(message ?? SyncError.Code[code]);
    this.name = "GenerateError";
  }
}

export namespace SyncError {
  export const symbol = Symbol.for("kra.k-registry.error");
  export type Code = keyof typeof Code;

  export function E(code: SyncError.Code) {
    return class extends SyncError {
      readonly [symbol] = true;

      static is(ty: unknown): ty is SyncError {
        return (
          typeof ty === "object" &&
          Reflect.get(ty, symbol) === true &&
          Reflect.get(ty, "code") === code
        );
      }

      constructor(message?: string) {
        super(code, message);
      }
    };
  }

  export const NO_VERSION = E("NO_VERSION");

  export const Code = {
    NO_VERSION: "no version available for the package",
  } as const;
}
