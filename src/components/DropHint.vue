<script setup>
import { ui } from '../core/state.js';
import { t } from '../i18n/index.js';
</script>

<template>
  <div id="drop" :class="{ show: ui.dragging }">{{ t('dropText') }}</div>
</template>
