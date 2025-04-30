export interface Requests {
  'storage/has'(key: string): Promise<boolean>;
  'storage/remove'(key: string): Promise<void>;
  'storage/setRaw'(key: string, value: string): Promise<void>;
  'storage/set'(key: string, value: unknown): Promise<void>;
  'storage/getRaw'(key: string): Promise<string | null>;
  'storage/get'(key: string): Promise<unknown | null>;
  'storage/_internal/clear'(): Promise<void>;
}

declare module '@p/communicate' {
  export interface Requests {
    'storage/has'(key: string): Promise<boolean>;
    'storage/remove'(key: string): Promise<void>;
    'storage/setRaw'(key: string, value: string): Promise<void>;
    'storage/set'(key: string, value: unknown): Promise<void>;
    'storage/getRaw'(key: string): Promise<string | null>;
    'storage/get'(key: string): Promise<unknown | null>;
    'storage/_internal/clear'(): Promise<void>;
  }
}
