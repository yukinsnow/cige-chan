<script setup>
import { computed, ref, watch } from 'vue';
import { state, ui } from '../core/state.js';
import { t } from '../i18n/index.js';
import { save } from '../core/persist.js';
import { closeDialog } from '../ui/dialogs.js';
import { buildLrc } from '../core/lrc.js';
import { download } from '../platform/save.js';
import { toast } from '../ui/toast.js';
import Icon from './Icon.vue';
import { Music4, FileMusic, RotateCcw } from 'lucide';

const props = defineProps({ onReadTiming: Function });

const offset = computed({
  get: () => state.lrc.offset,
  set: v => { state.lrc.offset = clamp(v); save(); },
});

const clamp = v => Math.min(30, Math.max(-30, Math.round((+v || 0) * 1000) / 1000));

/* 输入框要能留住 "-" 和 "1." 这种半成品，所以自己存字符串，
   失焦或回车才写回 state；滑块那边改了要同步显示。 */
const box = ref(String(state.lrc.offset));
watch(offset, v => { if (+box.value !== v) box.value = String(v); });
const commit = () => { offset.value = box.value; box.value = String(offset.value); };

const beat = computed(() => (ui.timing?.bpm ? 60 / ui.timing.bpm : 0));
// 没导入过旋律时不知道 BPM，退回 0.05 秒一档
const step = computed(() => beat.value || 0.05);
const nudge = n => { offset.value = offset.value + n * step.value; };
const wheel = e => nudge(e.deltaY < 0 ? 1 : -1);
const word = computed({
  get: () => state.lrc.word,
  set: v => { state.lrc.word = v; save(); },
});

const built = computed(() => {
  if (!ui.timing) return { error: 'none' };
  return buildLrc(ui.timing.times, { offset: offset.value, word: word.value });
});

const preview = computed(() => {
  const b = built.value;
  if (b.error === 'none') return t('lrcNeedTiming');
  if (b.error === 'count') return t('lrcMismatch', b.want, b.got);
  return b.text.split('\n').slice(0, 8).join('\n');
});

function go() {
  const b = built.value;
  if (b.error) { toast(preview.value); return; }
  download(state.title + '.lrc', b.text);
  closeDialog();
}
</script>

<template>
  <div id="lrc" :class="{ show: ui.dialog === 'lrc' }" @click.self="closeDialog">
    <div class="card">
      <div class="chead"><h3>{{ t('btnExpLrc') }}</h3></div>
      <div class="cbody">
        <p>{{ t('lrcIntro') }}</p>

        <div class="lrcsrc" :class="{ has: !!ui.timing }">
          <span>{{ ui.timing ? t('lrcHasTiming', t('lrcSrc' + ui.timing.src), ui.timing.times.length)
                             : t('lrcNoTiming') }}</span>
          <span class="lrcbtns">
            <button @click="props.onReadTiming('svp')">
              <Icon :node="FileMusic" :size="13" /> {{ t('lrcReadSvp') }}</button>
            <button @click="props.onReadTiming('midi')">
              <Icon :node="Music4" :size="13" /> {{ t('lrcReadMidi') }}</button>
          </span>
        </div>

        <label class="slid"><span>{{ t('lrcOffset') }}</span>
          <span class="offbox" @wheel.prevent="wheel">
            <input type="text" inputmode="decimal" v-model="box" :data-tip="t('lrcOffsetBox')"
                   @change="commit" @blur="commit" @keydown.enter="commit"
                   @keydown.up.prevent="nudge(beat ? 1 : 0.05 / (beat || 1))"
                   @keydown.down.prevent="nudge(beat ? -1 : -0.05 / (beat || 1))">
            <i>s</i>
          </span>
          <input type="range" min="-5" max="5" step="0.05" v-model="offset"></label>

        <div class="offnudge">
          <template v-if="beat">
            <button @click="nudge(-1)">−1 {{ t('lrcBeat') }}</button>
            <button @click="nudge(-0.5)">−½</button>
            <button @click="nudge(0.5)">+½</button>
            <button @click="nudge(1)">+1 {{ t('lrcBeat') }}</button>
            <span class="offbpm">{{ t('lrcBpm', ui.timing.bpm.toFixed(0), beat.toFixed(3)) }}</span>
          </template>
          <button v-if="offset" class="offzero" @click="offset = 0">
            <Icon :node="RotateCcw" :size="12" /> {{ t('lrcReset') }}</button>
        </div>
        <p class="tip">{{ t('lrcOffsetTip') }}</p>

        <label class="ck"><input type="checkbox" v-model="word">
          <span><span>{{ t('lrcWord') }}</span><i>{{ t('lrcWordTip') }}</i></span></label>

        <div class="prev">{{ preview }}</div>
      </div>
      <div class="cfoot">
        <button @click="closeDialog">{{ t('askCancel') }}</button>
        <button class="pri" :disabled="!!built.error" @click="go">{{ t('lrcGo') }}</button>
      </div>
    </div>
  </div>
</template>
