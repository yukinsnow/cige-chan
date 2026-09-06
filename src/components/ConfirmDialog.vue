<script setup>
import { watch, nextTick, ref } from 'vue';
import { t } from '../i18n/index.js';
import { dlg, close } from '../ui/confirm.js';
import Icon from './Icon.vue';
import { CircleAlert } from 'lucide';

const okBtn = ref(null);
// 打开时把焦点放在主按钮上，回车即确认
watch(() => dlg.shown, async on => { if (on) { await nextTick(); okBtn.value?.focus(); } });
</script>

<template>
  <div v-if="dlg.shown" id="ask" @click.self="close(false)"
       @keydown.esc="close(false)">
    <div class="card askcard">
      <div class="askbody">
        <Icon :node="CircleAlert" :size="20" class="askicon" />
        <p>{{ dlg.text }}</p>
      </div>
      <div class="cfoot">
        <button @click="close(false)">{{ dlg.cancel || t('askCancel') }}</button>
        <button ref="okBtn" class="pri" @click="close(true)">{{ dlg.ok || t('askOk') }}</button>
      </div>
    </div>
  </div>
</template>
