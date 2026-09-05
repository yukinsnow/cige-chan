<script setup>
import { t } from '../../i18n/index.js';

const icon = import.meta.env.BASE_URL + 'logo.png';
const version = __APP_VERSION__;
</script>

<template>
  <div class="aboutbox">
    <img class="logo" :src="icon" alt="">
    <h3>{{ t('brand') }}</h3>
    <p class="tagline">{{ t('tagline') }}</p>
    <p class="ver">{{ t('aboutVersion') }} {{ version }}</p>
  </div>
  <p class="powered">{{ t('aboutPowered') }}</p>
  <p class="credit">
    <span v-html="t('creditLine')"></span><br>
    <a class="me" href="https://response.run/" target="_blank" rel="noopener">response.run</a>
  </p>
  <p class="tip">
    <a class="me" href="https://github.com/yukinsnow/cige-chan" target="_blank" rel="noopener">
      {{ t('aboutRepo') }}</a>
  </p>
</template>
