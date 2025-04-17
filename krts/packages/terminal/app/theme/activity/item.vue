<template>
  <div
    class="activity-item"
    :class="{ 'active': isActive, 'drag-over': hasDragOver }"
    @contextmenu.stop="trigger($event, children[0])"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @dragover.prevent>
    <div :class="['float', show ? 'show' : '']" ref="float" :style="floatingStyles">
      <div class="activity-info">
        <div class="title">{{ children[hoverIndex].name }}</div>
        <div class="desc" v-if="children[hoverIndex].desc">{{ children[hoverIndex].desc }}</div>
      </div>
      <div class="activity-group" v-if="children.length > 1">
        <div class="activity-group-item" v-for="(child, index) in children.slice(1)" :key="child.id">
          <activity-button
              :data="child"
              @mouseenter="hoverIndex = index + 1"
              @mouseleave="hoverIndex = 0"
          ></activity-button>
        </div>
      </div>
    </div>
    <activity-button @mouseenter="show = true" @mouseleave="show = false" ref="button" :data="children[0]" :class="{ 'is-group': children.length > 1 }"></activity-button>
  </div>
</template>

<script lang="ts" setup>
import { useFloating } from '@floating-ui/vue';
import { type Activity, useConfig, useMenu } from '@krts/terminal';
import { computed, ref } from 'vue';
import { onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
// import { Placement } from 'element-plus'
import ActivityButton from './button.vue';

const show = ref(false);
const float = ref();
const button = ref<HTMLElement>();
const { floatingStyles } = useFloating(button, float, {
  placement: 'right',
});

// function showPop(ev) {
//   float.value.
//   float.value.show(ev);
// }

// function hidePop() {
//   float.value.hide();
// }

const route = useRoute();

const props = defineProps<{
  children: Activity[];
  // placement: Placement
}>();

const isActive = computed(() => {
  return Object.values(props.children).some(
    (child) => route.meta?.activity?.id === child.id,
  );
});

const hasDragOver = ref(false);

const trigger = useMenu('theme.activity');

const hoverIndex = ref(0);

watch(
  () => props.children,
  () => {
    hoverIndex.value = 0;
  },
);

function handleDragEnter(event: DragEvent) {
  hasDragOver.value = true;
}

function handleDragLeave(event: DragEvent) {
  hasDragOver.value = false;
}

const config = useConfig();

function handleDrop(event: DragEvent) {
  hasDragOver.value = false;
  const text = event.dataTransfer.getData('text/plain');
  if (!text.startsWith('activity:')) return;
  const id = text.slice(9);
  const target = props.children[0].id;
  if (target === id) return;
  event.preventDefault();

  const override = ((config.value.activities ??= {})[id] ??= {});
  if (override.parent === target) {
    delete override.parent;
    (config.value.activities[target] ??= {}).parent = id;
    for (const key in config.value.activities) {
      const override = config.value.activities[key];
      if (override?.parent === target) {
        override.parent = id;
      }
    }
  } else {
    override.parent = target;
  }
}
</script>

<style lang="scss">
.float {
  z-index: 200;
  background: var(--p-surface-900);
  padding: 0.5rem;
  border-radius: 10px;
  user-select: none;
  opacity: 0;
  animation: showAnimation 300ms ease-in-out forwards;
  animation-play-state: paused;

  &.show {
    animation-fill-mode: forwards;
    animation-play-state: running;
  }
  &:not(.show) {
    animation: hideAnimation 500ms ease-in-out forwards;
  }

  &::before {
    --p-tooltip-gutter: 0.5rem;
    --p-tooltip-background: var(--p-surface-900);
    content: '';
    top: 50%;
    left: -5px;
    margin-top: calc(-1 * var(--p-tooltip-gutter));
    border-width: var(--p-tooltip-gutter) var(--p-tooltip-gutter) var(--p-tooltip-gutter) 0;
    /* border-right-color: var(--p-tooltip-background); */
    position: absolute;
    width: 0;
    height: 0;
    border-color: transparent var(--p-tooltip-background) transparent transparent;
    border-style: solid;
  }
}

@keyframes hideAnimation {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

@keyframes showAnimation {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.activity-item {
  position: relative;
  box-sizing: border-box;
  width: var(--activity-width);
  padding: 0 var(--activity-padding);

  .layout-activity &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: var(--activity-marker-width);
    height: var(--activity-marker-height);
    transform: translateX(-100%) translateY(-50%);
    display: block;
    border-radius: 0 var(--activity-marker-width) var(--activity-marker-width) 0;
    background-color: var(--k-text-active);
    transition: all 0.3s ease;
  }

  .layout-activity &.active::before,
  .layout-activity &.drag-over::before {
    transform: translateY(-50%);
  }
}

.activity-item-tooltip {
  padding: 0;

  .activity-info {
    padding: 6px 11px;
    line-height: 1.6;

    .title {
      font-size: 13px;
      font-weight: 500;
    }

    .desc {
      font-size: 12px;
    }
  }

  .activity-group {
    display: flex;
    padding: var(--activity-padding);
    gap: 0 var(--activity-padding);
    border-top: 1px solid var(--k-color-divider);

    .activity-group-item {
      width: calc(var(--activity-width) - 2 * var(--activity-padding));
    }
  }
}

</style>
