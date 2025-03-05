import { useContext } from '../context';
import {
  type App,
  type Component,
  type DefineComponent,
  defineComponent,
  h,
} from 'vue';

export interface SlotItem {
  order?: number;
  component: Component | DefineComponent;
}

export interface SlotOptions extends SlotItem {
  type: string;
  /** @deprecated */
  when?: () => boolean;
  disabled?: () => boolean;
}

export const KSlot = defineComponent({
  props: {
    name: {
      type: String,
      required: true,
    },
    data: Object,
    single: Boolean,
  },
  setup(props, { slots }) {
    const ctx = useContext();
    return () => {
      const internal = props.single
        ? []
        : [...(slots.default?.() || [])]
            .filter((node) => node.type === KSlotItem)
            .map((node) => ({ node, order: node.props?.order || 0 }));
      const external = [...(ctx.$router.views[props.name] || [])]
        .filter((item) => !item.disabled?.())
        .map((item) => ({
          node: h(item.component, { ...props.data }, slots),
          order: item.order,
          layer: 1,
        }));
      const children = [...internal, ...external].sort(
        (a, b) => b.order - a.order,
      );
      if (props.single) {
        return children[0]?.node || slots.default?.();
      }
      return children.map((item) => item.node);
    };
  },
});

const KSlotItem = defineComponent({
  props: {
    order: Number,
  },
  setup(_props, { slots }) {
    return () => slots.default?.();
  },
});

function defineSlotComponent(name: string) {
  return defineComponent({
    inheritAttrs: false,
    setup(_, { slots, attrs }) {
      return () => h(KSlot, { name, data: attrs, single: true }, slots);
    },
  });
}

export default (app: App) => {
  app.component('k-slot', KSlot);
  app.component('k-slot-item', KSlotItem);
  app.component('k-layout', defineSlotComponent('layout'));
  app.component('k-status', defineSlotComponent('status'));
};
