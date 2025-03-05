export type RemovableRef<T> = Omit<Ref<T>, 'value'> & {
  get value(): T;
  set value(value: T | null | undefined);
};
