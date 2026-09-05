<script setup>
import { computed } from 'vue';
import { state } from '../core/state.js';
import { cap, CL, RT } from '../core/clusters.js';
import { t } from '../i18n/index.js';

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
</script>

<template>
  <span>{{ t('statFilledPre') }} <b>{{ s.filled }}</b> / <b>{{ s.total }}</b> {{ t('statFilledUnit') }}</span>
  <span>{{ t('statDonePre') }} <b>{{ s.pct }}</b></span>
  <span>{{ t('statOverPre') }} <b>{{ s.over }}</b> {{ t('statOverUnit') }}</span>
  <span>{{ t('statLinesPre') }} <b>{{ s.lines }}</b></span>
</template>
