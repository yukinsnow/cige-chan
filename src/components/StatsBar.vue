<script setup>
import { computed, ref } from 'vue';
import { state } from '../core/state.js';
import { cap, CL, RT } from '../core/clusters.js';
import { t } from '../i18n/index.js';
import { toast } from '../ui/toast.js';
import Icon from './Icon.vue';
import { ClipboardCopy, Check } from 'lucide';

const s = computed(() => {
  let filled = 0, total = 0, over = 0, lines = 0;
  for (const sec of state.sections) for (const L of sec.lines) {
    const C = cap(L), cl = CL(RT(L.t));
    total += C;
    filled += cl.slice(0, C).filter(c => c !== ' ' && c !== '　').length;
    over += Math.max(0, cl.length - C);
    lines++;
  }
  return { filled, total, over, lines, pct: total ? Math.round(filled / total * 100) + '%' : '0%' };
});

const done = ref(false);
async function copy() {
  const v = s.value;
  const text = [
    `${t('statFilledPre')} ${v.filled} / ${v.total} ${t('statFilledUnit')}`,
    `${t('statDonePre')} ${v.pct}`,
    `${t('statOverPre')} ${v.over} ${t('statOverUnit')}`,
    `${t('statLinesPre')} ${v.lines}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    done.value = true;
    setTimeout(() => { done.value = false; }, 1400);
  } catch (e) {
    toast(t('toastCopyFail'));
  }
}
</script>

<template>
  <span>{{ t('statFilledPre') }} <b>{{ s.filled }}</b> / <b>{{ s.total }}</b> {{ t('statFilledUnit') }}</span>
  <span>{{ t('statDonePre') }} <b>{{ s.pct }}</b></span>
  <span>{{ t('statOverPre') }} <b>{{ s.over }}</b> {{ t('statOverUnit') }}</span>
  <span>{{ t('statLinesPre') }} <b>{{ s.lines }}</b></span>
  <button class="statcopy" :data-tip="t('statCopy')" @click="copy">
    <Icon :node="done ? Check : ClipboardCopy" :size="13" /></button>
</template>
