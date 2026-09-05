<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { isMac, winMinimize, winToggleMax, winClose, winIsMax, winResize } from '../platform/env.js';
import { t } from '../i18n/index.js';

const maxed = ref(false);
const sync = async () => { try { maxed.value = await winIsMax(); } catch (e) {} };
onMounted(() => { sync(); addEventListener('resize', sync); });
onUnmounted(() => removeEventListener('resize', sync));

// 无边框窗口在 Windows 上没有系统的拖拽缩放边，得自己铺八条
const EDGES = ['North', 'South', 'East', 'West', 'NorthWest', 'NorthEast', 'SouthWest', 'SouthEast'];
</script>

<template>
  <div class="wctl" :class="{ mac: isMac }">
    <button class="w-min" :data-tip="t('winMinimize')" @click="winMinimize">
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg>
    </button>
    <button class="w-max" :data-tip="t('winMaximize')" @click="winToggleMax">
      <svg v-if="maxed" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2.5 2.5V0.5h7v7h-2" /><rect x="0.5" y="2.5" width="7" height="7" rx="1" />
      </svg>
      <svg v-else viewBox="0 0 10 10" aria-hidden="true">
        <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" />
      </svg>
    </button>
    <button class="w-close" :data-tip="t('winClose')" @click="winClose">
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></svg>
    </button>
  </div>

  <span v-for="d in EDGES" :key="d" class="w-edge" :class="'e-' + d"
        data-tauri-drag-region="false" @mousedown.prevent="winResize(d)"></span>
</template>
