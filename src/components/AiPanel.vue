<script setup>
import { computed, watch } from 'vue';
import { state } from '../core/state.js';
import { t } from '../i18n/index.js';
import { aiCfg, aiUi, aiClosePanel, aiRunAll, aiTest, aiStop, aiPendingLines, aiSaveCfg } from '../ai.js';

const cfg = key => computed({
  get: () => aiCfg[key],
  set: v => { aiCfg[key] = v; aiSaveCfg(); },
});
const num = key => computed({
  get: () => aiCfg[key],
  set: v => { aiCfg[key] = +v; aiSaveCfg(); },
});

const baseUrl = cfg('baseUrl'), apiKey = cfg('apiKey'), model = cfg('model'), style = cfg('style');
const maxTokens = num('maxTokens'), temperature = num('temperature');
const scope = cfg('scope');

// 段落名可能改过，下拉每次跟着 state 重算
const scopes = computed(() => [
  { v: 'all', label: t('aiScopeAll') },
  ...state.sections.map((sec, i) => ({ v: 'sec-' + i, label: t('aiScopeSec', i + 1, sec.name) })),
]);
const pending = computed(() => t('aiPending', aiPendingLines().length));
const pct = computed(() => aiUi.total > 0 ? Math.round(aiUi.done / aiUi.total * 100) : 0);
const progText = computed(() => aiUi.msg || t('aiProg', aiUi.done, aiUi.total));

// 范围下拉里被删掉的段落要退回整首，否则 select 会显示空
watch(scopes, list => {
  if (!list.some(o => o.v === aiCfg.scope)) { aiCfg.scope = 'all'; aiSaveCfg(); }
});
</script>

<template>
  <div id="aip" :class="{ show: aiUi.shown }" @click.self="aiClosePanel">
    <div class="card">
      <h3>{{ t('aiTitle') }}</h3>
      <p>{{ t('aiIntro') }}</p>
      <p class="aihint" style="margin:-6px 0 12px" v-html="t('aiDisclaimer')"></p>

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

      <div class="airow"><label>{{ t('aiStyleLabel') }}</label>
        <textarea v-model="style" rows="3" :disabled="aiUi.busy" :placeholder="t('aiStylePh')"></textarea>
        <span class="aihint">{{ t('aiStyleHint') }}</span></div>

      <div class="airow aiadv"><label>{{ t('aiScopeLabel') }}</label>
        <select v-model="scope" :disabled="aiUi.busy">
          <option v-for="o in scopes" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <span class="aihint">{{ pending }}</span></div>

      <h4>{{ t('aiAdvH4') }}</h4>
      <div class="airow aiadv"><label>{{ t('aiMaxTokensLabel') }}</label>
        <input type="range" min="500" max="8000" step="100" v-model="maxTokens" :disabled="aiUi.busy">
        <b>{{ maxTokens }}</b></div>
      <div class="airow aiadv"><label>{{ t('aiTemperatureLabel') }}</label>
        <input type="range" min="0" max="2" step="0.1" v-model="temperature" :disabled="aiUi.busy">
        <b>{{ Number(temperature).toFixed(1) }}</b></div>

      <div class="aibtns">
        <template v-if="!aiUi.busy">
          <button class="pri" @click="aiRunAll('fill')">{{ t('aiGo') }}</button>
          <button @click="aiRunAll('check')">{{ t('aiCheckBtn') }}</button>
          <button :disabled="aiUi.testing" @click="aiTest">
            {{ aiUi.testing ? t('aiTesting') : t('aiTestBtn') }}</button>
        </template>
        <button v-else class="stop" @click="aiStop">
          {{ aiUi.stopping ? t('aiStopping') : t('aiStop') }}</button>
        <button :disabled="aiUi.busy" @click="aiClosePanel">{{ t('aiClose') }}</button>
      </div>

      <div v-if="aiUi.total" class="aiprog">
        <div class="aibar"><div :style="{ width: pct + '%' }"></div></div>
        <span class="aiptext">{{ progText }}</span>
      </div>
      <div class="ailog">
        <div v-for="(row, i) in aiUi.log" :key="i" class="ailog-row">{{ row }}</div>
      </div>
    </div>
  </div>
</template>
