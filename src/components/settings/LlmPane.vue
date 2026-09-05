<script setup>
import { computed } from 'vue';
import { t } from '../../i18n/index.js';
import { aiCfg, aiUi, aiTest, aiSaveCfg } from '../../ai.js';
import Icon from '../Icon.vue';
import { Check, ShieldCheck } from 'lucide';

const cfg = key => computed({
  get: () => aiCfg[key],
  set: v => { aiCfg[key] = v; aiSaveCfg(); },
});
const num = key => computed({
  get: () => aiCfg[key],
  set: v => { aiCfg[key] = +v; aiSaveCfg(); },
});
const baseUrl = cfg('baseUrl'), apiKey = cfg('apiKey'), model = cfg('model');
const maxTokens = num('maxTokens'), temperature = num('temperature');

// 没同意免责声明之前不给填——接口是用户自己的钱和自己的内容，得先看清楚
const agree = () => { aiCfg.agreed = true; aiSaveCfg(); };
const revoke = () => { aiCfg.agreed = false; aiSaveCfg(); };
</script>

<template>
  <template v-if="!aiCfg.agreed">
    <h4>{{ t('setAgreeH4') }}</h4>
    <div class="disclaimer" v-html="t('aiDisclaimer')"></div>
    <div class="bgrow" style="margin-top:16px">
      <button class="pri" @click="agree"><Icon :node="Check" :size="15" /> {{ t('setAgree') }}</button>
    </div>
  </template>

  <template v-else>
    <p class="agreed"><Icon :node="ShieldCheck" :size="14" /> {{ t('setAgreed') }}
      <button class="linkbtn" @click="revoke">{{ t('setRevoke') }}</button></p>

    <div class="airow"><label>{{ t('aiUrlLabel') }}</label>
      <input type="text" v-model="baseUrl" :disabled="aiUi.busy"
             placeholder="https://api.example.com/v1" spellcheck="false" autocomplete="off">
      <span class="aihint">{{ t('aiUrlHint') }}</span></div>
    <div class="airow"><label>{{ t('aiKeyLabel') }}</label>
      <input type="password" v-model="apiKey" :disabled="aiUi.busy"
             placeholder="sk-…" spellcheck="false" autocomplete="off">
      <span class="aihint">{{ t('aiKeyHint') }}</span></div>
    <div class="airow"><label>{{ t('aiModelLabel') }}</label>
      <input type="text" v-model="model" :disabled="aiUi.busy"
             placeholder="gpt-4o-mini / deepseek-chat / …" spellcheck="false" autocomplete="off">
      <span class="aihint">{{ t('aiModelHint') }}</span></div>

    <h4>{{ t('aiAdvH4') }}</h4>
    <div class="airow aiadv"><label>{{ t('aiMaxTokensLabel') }}</label>
      <input type="range" min="500" max="8000" step="100" v-model="maxTokens" :disabled="aiUi.busy">
      <b>{{ maxTokens }}</b></div>
    <div class="airow aiadv"><label>{{ t('aiTemperatureLabel') }}</label>
      <input type="range" min="0" max="2" step="0.1" v-model="temperature" :disabled="aiUi.busy">
      <b>{{ Number(temperature).toFixed(1) }}</b></div>

    <div class="bgrow" style="margin-top:16px">
      <button :disabled="aiUi.testing || aiUi.busy" @click="aiTest">
        {{ aiUi.testing ? t('aiTesting') : t('aiTestBtn') }}</button>
    </div>
  </template>
</template>
