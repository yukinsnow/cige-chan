<script setup>
import { state } from '../../core/state.js';
import { I18N, t, LANG_NAME } from '../../i18n/index.js';
import { save } from '../../core/persist.js';
import { redraw } from '../../core/state.js';

function setLang(lang) {
  // 标题还是各语言默认的「未命名」占位符时跟着语言一起换 自己写过就不动
  const wasDefault = Object.values(I18N).some(d => d.untitled === state.title);
  state.lang = lang;
  if (wasDefault) state.title = t('untitled');
  redraw(); save();
}
</script>

<template>
  <div class="setlist">
    <button v-for="(name, code) in LANG_NAME" :key="code"
            :class="{ on: state.lang === code }" @click="setLang(code)">{{ name }}</button>
  </div>
  <p class="tip" v-if="t('aiTransNote')" v-html="t('aiTransNote')"></p>
</template>
