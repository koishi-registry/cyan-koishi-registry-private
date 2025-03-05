<template>
  <k-layout :main="`darker page-home${event ? '' : ' loading'}`">
    <ScrollPanel v-if="event">
      <k-slot name="home"></k-slot>
    </ScrollPanel>
    <div v-else>
      <k-card class="connect">正在连接到 Cordis 服务器……</k-card>
    </div>
  </k-layout>
</template>

<script lang="ts" setup>
import { event } from '@web/client';
</script>

<style lang="scss">
ScrollPanel {
  background-color: var(--p-surface-900);
}

.page-home {
  &.loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .k-card.connect {
    width: 400px;
    max-width: 400px;
    text-align: center;
    line-height: 2;

    p {
      margin: 0;
    }
  }
}

</style>
