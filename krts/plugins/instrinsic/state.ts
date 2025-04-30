export class ClientState {
  // biome-ignore lint/suspicious/noExplicitAny: state value is any type
  #store: () => Map<string, any>;

  // biome-ignore lint/suspicious/noExplicitAny: state value is any type
  constructor(public state: () => Map<string, any>) {}

  eq(other: ClientState): boolean {
    return this.state() === other.state();
  }

  get(key: string) {
    return this.state().get(key);
  }

  has(key: string) {
    return this.state().has(key);
  }

  // biome-ignore lint/suspicious/noExplicitAny: state value is any type
  set(key: string, value: any) {
    this.state().set(key, value);
  }

  delete(key: string) {
    this.state().delete(key);
  }

  clear() {
    this.state().clear();
  }
}
