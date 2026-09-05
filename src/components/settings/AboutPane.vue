<script setup>
import { t } from '../../i18n/index.js';
import Icon from '../Icon.vue';
import { Globe } from 'lucide';
import { GithubMark } from '../../ui/brand.js';

const icon = import.meta.env.BASE_URL + 'logo.png';
const version = __APP_VERSION__;
</script>

<template>
  <div class="aboutbox">
    <img class="logo" :src="icon" alt="" draggable="false">
    <h3>{{ t('brand') }}</h3>
    <p class="tagline">{{ t('tagline') }}</p>
    <p class="ver">{{ version }}</p>
  </div>

  <div class="aboutby">
    <p class="powered" v-html="t('aboutPowered')"></p>
  </div>

  <p class="aboutlinks">
    <a class="me" href="https://github.com/yukinsnow/cige-chan" target="_blank" rel="noopener">
      <Icon :node="GithubMark" :size="14" box="0 0 16 16" /> {{ t('aboutRepo') }}</a>
    <a class="me" href="https://response.run/" target="_blank" rel="noopener">
      <Icon :node="Globe" :size="14" /> {{ t('aboutSite') }}</a>
  </p>
</template>
