<script setup>
import { computed } from 'vue';
import { state, ui } from '../core/state.js';
import { RT } from '../core/clusters.js';
import { lineOut, lyrTxt } from '../core/txt.js';
import { t } from '../i18n/index.js';
import { save } from '../core/persist.js';
import { closeDialog } from '../ui/dialogs.js';
import { download } from '../platform/save.js';

const opt = key => computed({
  get: () => !!(state.exp && state.exp[key]),
  set: v => { state.exp[key] = v; save(); },
});
const alts = opt('alts');
const note = opt('note');

const preview = computed(() => {
  const o = { alts: alts.value, note: note.value };
  const sec = state.sections[0];
  const body = sec
    ? '[' + sec.name + ']\n' + sec.lines.slice(0, 6).map(L => lineOut(L, o) || t('expEmptyLine')).join('\n')
    : t('expEmptyAll');
  const n = state.sections.reduce((a, s) => a + s.lines.filter(L => L.alts.filter(x => x !== RT(L.t)).length).length, 0);
  const m = state.sections.reduce((a, s) => a + s.lines.filter(L => L.note).length, 0);
  return t('expPreviewLabel') + '\n\n' + body + '\n\n———\n' + t('expSummary', n, m);
});

function go() {
  const o = { alts: alts.value, note: note.value };
  const tag = (o.alts ? t('fnTagAlts') : '') + (o.note ? t('fnTagNote') : '');
  download(state.title + t('fnLyricBase') + tag + '.txt', lyrTxt(o));
  closeDialog();
}
</script>

<template>
  <div id="exp" :class="{ show: ui.dialog === 'exp' }" @click.self="closeDialog">
    <div class="card">
      <h3>{{ t('expTitle') }}</h3>
      <p style="margin-bottom:14px">{{ t('expIntro') }}</p>
      <label class="ck">
        <input type="checkbox" v-model="alts">
        <span><span>{{ t('expCk1Label') }}</span><i>{{ t('expCk1Desc') }}</i></span>
      </label>
      <label class="ck">
        <input type="checkbox" v-model="note">
        <span><span>{{ t('expCk2Label') }}</span><i>{{ t('expCk2Desc') }}</i></span>
      </label>
      <div class="prev">{{ preview }}</div>
      <p style="text-align:right;margin-top:16px">
        <button @click="closeDialog">{{ t('expCancel') }}</button>
        <button class="pri" @click="go">{{ t('expGo') }}</button>
      </p>
    </div>
  </div>
</template>
