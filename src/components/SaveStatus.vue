<script setup>
import { computed } from 'vue';
import { state, ui } from '../core/state.js';
import { t, LOCALE } from '../i18n/index.js';

const text = computed(() => {
  if (ui.saveFailed) return t('autosaveUnavailable');
  if (ui.savedAt === null) return t('autosavedOn');
  const time = new Date(ui.savedAt).toLocaleTimeString(
    LOCALE[state.lang] || 'zh-CN', { hour: '2-digit', minute: '2-digit' });
  return t('autosavedAt', time);
});
</script>

<template>{{ text }}</template>
