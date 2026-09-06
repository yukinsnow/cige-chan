<script setup>
import { ref, computed, watch } from 'vue';
import { brk, closeBreak } from '../ui/brk.js';
import { t } from '../i18n/index.js';
import Icon from './Icon.vue';
import { X, Scissors } from 'lucide';

const cuts = ref(new Set());
watch(() => brk.shown, on => { if (on) cuts.value = new Set(); });

// 每个分句摊成 {n, text}，text 空着说明这段还没填字
const groups = computed(() => {
  const out = [];
  let i = 0;
  for (const n of brk.g) {
    out.push({ n, text: brk.cells.slice(i, i + n).join('').trim() });
    i += n;
  }
  return out;
});

const parts = computed(() => {
  const at = [...cuts.value].sort((a, b) => a - b);
  const bd = [0, ...at, brk.g.length];
  return bd.slice(1).map((e, k) => groups.value.slice(bd[k], e));
});

function toggle(i) {
  const s = new Set(cuts.value);
  s.has(i) ? s.delete(i) : s.add(i);
  cuts.value = s;
}
</script>

<template>
  <div v-if="brk.shown" id="brkdlg" @click.self="closeBreak(null)">
    <div class="card brkcard">
      <div class="chead">
        <h3>{{ t('breakTitle') }}</h3>
        <button class="cclose" @click="closeBreak(null)"><Icon :node="X" :size="15" /></button>
      </div>

      <div class="cbody">
        <p class="tip" style="margin:0 0 14px">{{ t('breakHint') }}</p>

        <div class="brkline">
          <template v-for="(g, i) in groups" :key="i">
            <button v-if="i" class="brkcut" :class="{ on: cuts.has(i) }"
                    :data-tip="t('breakCutTip')" @click="toggle(i)">
              <Icon :node="Scissors" :size="13" /></button>
            <span class="brkgrp">
              <b :class="{ blank: !g.text }">{{ g.text || t('breakUnfilled') }}</b>
              <i>{{ t('breakCells', g.n) }}</i>
            </span>
          </template>
        </div>

        <div class="brkprev">
          <div v-for="(p, k) in parts" :key="k" class="brkrow">
            <span class="brkno">{{ k + 1 }}</span>
            <span class="brkpat">{{ p.map(x => x.n).join('/') }}</span>
            <span class="brktxt">{{ p.map(x => x.text).filter(x => x).join(' ') || '—' }}</span>
          </div>
        </div>
      </div>

      <div class="cfoot">
        <button @click="closeBreak(null)">{{ t('askCancel') }}</button>
        <button class="pri" :disabled="!cuts.size" @click="closeBreak([...cuts])">
          {{ t('breakOk', parts.length) }}</button>
      </div>
    </div>
  </div>
</template>
