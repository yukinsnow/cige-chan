<script setup>
import { t } from '../i18n/index.js';
import Icon from './Icon.vue';
import { GithubMark } from '../ui/brand.js';
</script>

<template>
  <a class="me" href="https://github.com/yukinsnow" target="_blank" rel="noopener" :data-tip="t('githubTitle')">
    <Icon :node="GithubMark" :size="13" box="0 0 16 16" />
    @yukinsnow
  </a>
  <a class="me" href="https://github.com/yukinsnow/cige-chan" target="_blank" rel="noopener" :data-tip="t('teamTitle')">
    {{ t('teamLabel') }}
  </a>
</template>
