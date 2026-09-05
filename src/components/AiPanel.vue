<script setup>
import { computed, watch } from 'vue';
import { state } from '../core/state.js';
import { t } from '../i18n/index.js';
import { aiCfg, aiUi, aiClosePanel, aiRunAll, aiStop, aiPendingLines, aiSaveCfg } from '../ai.js';
import { ui } from '../core/state.js';
import { openDialog } from '../ui/dialogs.js';

const openLlm = () => { ui.settingsTab = 'llm'; openDialog('settings'); };
import Icon from './Icon.vue';
import { Settings } from 'lucide';

const scope = computed({
  get: () => aiCfg.scope,
  set: v => { aiCfg.scope = v; aiSaveCfg(); },
});
const style = computed({
  get: () => aiCfg.style,
  set: v => { aiCfg.style = v; aiSaveCfg(); },
});

// 段落名可能改过，下拉每次跟着 state 重算
const scopes = computed(() => [
  { v: 'all', label: t('aiScopeAll') },
  ...state.sections.map((sec, i) => ({ v: 'sec-' + i, label: t('aiScopeSec', i + 1, sec.name) })),
]);
const pending = computed(() => {
  const n = aiPendingLines().length;
  return n ? t('aiPending', n) : t('aiPendingNone');
});
const ready = computed(() => !!(aiCfg.agreed && aiCfg.baseUrl && aiCfg.apiKey && aiCfg.model));
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
      <div class="chead"><h3>{{ t('aiTitle') }}</h3></div>
      <div class="cbody">
      <p>{{ t('aiIntro') }}</p>

      <!-- 接口没配全时不让点填词，直接把人带去设置 -->
      <p v-if="!ready" class="ainote">
        {{ t('aiToastNeedCfg') }}
        <button style="margin-left:6px" @click="openLlm">
          <Icon :node="Settings" :size="13" /> {{ t('setLlm') }}</button>
      </p>

      <div class="airow"><label>{{ t('aiStyleLabel') }}</label>
        <textarea v-model="style" rows="3" :disabled="aiUi.busy" :placeholder="t('aiStylePh')"></textarea>
        <span class="aihint">{{ t('aiStyleHint') }}</span></div>

      <div class="airow aiadv"><label>{{ t('aiScopeLabel') }}</label>
        <select v-model="scope" :disabled="aiUi.busy">
          <option v-for="o in scopes" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <span class="aihint">{{ pending }}</span></div>
      </div>

      <!-- 进度和日志固定在底部：跑起来的时候不该跟着内容滚走 -->
      <div v-if="aiUi.total || aiUi.log.length" class="airun">
        <div v-if="aiUi.total" class="aiprog">
          <div class="aibar"><div :style="{ width: pct + '%' }"></div></div>
          <span class="aiptext">{{ progText }}</span>
        </div>
        <div v-if="aiUi.log.length" class="ailog">
          <div v-for="(row, i) in aiUi.log" :key="i" class="ailog-row">{{ row }}</div>
        </div>
      </div>

      <div class="cfoot aibtns">
        <button class="cclose" :data-tip="t('setLlm')" style="margin-right:auto" @click="openLlm">
          <Icon :node="Settings" :size="15" /></button>
        <template v-if="!aiUi.busy">
          <button class="pri" :disabled="!ready" @click="aiRunAll('fill')">{{ t('aiGo') }}</button>
          <button :disabled="!ready" @click="aiRunAll('check')">{{ t('aiCheckBtn') }}</button>
        </template>
        <button v-else class="stop" @click="aiStop">
          {{ aiUi.stopping ? t('aiStopping') : t('aiStop') }}</button>
        <button :disabled="aiUi.busy" @click="aiClosePanel">{{ t('aiClose') }}</button>
      </div>
    </div>
  </div>
</template>
