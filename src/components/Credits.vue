<script setup>
import { t } from '../i18n/index.js';
import Icon from './Icon.vue';
import { GithubMark, BilibiliMark } from '../ui/brand.js';
</script>

<template>
  <a class="me" href="https://github.com/yukinsnow" target="_blank" rel="noopener" :data-tip="t('githubTitle')">
    <Icon :node="GithubMark" :size="13" box="0 0 16 16" />
    @yukinsnow
  </a>
  <a class="me" id="bili" href="https://space.bilibili.com/123372" target="_blank" rel="noopener" :data-tip="t('bilibiliTitle')">
    <Icon :node="BilibiliMark" :size="13" />
    <span>{{ t('bilibiliLabel') }}</span> @純白
  </a>
</template>
