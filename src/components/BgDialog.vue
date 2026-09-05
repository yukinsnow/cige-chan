<script setup>
import { computed } from 'vue';
import { state, ui } from '../core/state.js';
import { t } from '../i18n/index.js';
import { save } from '../core/persist.js';
import { closeDialog } from '../ui/dialogs.js';
import { ACCENTS, SWATCH, applyAccent, applyBg, saveBg, setBgColor } from '../core/theme.js';
import { toast } from '../ui/toast.js';
import { pickImage } from '../platform/open.js';

const isPaper = computed(() => state.theme === 'paper');
const hasImage = computed(() => state.bg.mode === 'image' && !!ui.bgImg);
const accents = computed(() => ACCENTS.map(a => ({
  id: a.id,
  color: isPaper.value ? a.paper : a.dark,
  on: a.id === (state.accent || 'auto'),
})));

const dimPct = computed({
  get: () => Math.round(state.bg.dim * 100),
  set: v => { state.bg.dim = +v / 100; applyBg(); save(); },
});
const blur = computed({
  get: () => state.bg.blur,
  set: v => { state.bg.blur = +v; applyBg(); save(); },
});

function setTheme(th) { state.theme = th; applyBg(); save(); }
function setAccent(id) { state.accent = id; applyAccent(); save(); }
function reset() {
  state.bg.mode = 'none'; ui.bgImg = '';
  applyBg(); saveBg(); save(); toast(t('toastBgReset'));
}
</script>

<template>
  <div id="bgPanel" :class="{ show: ui.dialog === 'bgPanel' }" @click.self="closeDialog">
    <div class="card">
      <h3>{{ t('bgTitle') }}</h3>
      <p style="margin-bottom:14px">{{ t('bgIntro') }}</p>

      <h4>{{ t('bgThemeH4') }}</h4>
      <div class="bgrow">
        <button class="pre" :class="{ on: state.theme === 'dark' }" @click="setTheme('dark')">{{ t('bgThemeDark') }}</button>
        <button class="pre" :class="{ on: isPaper }" @click="setTheme('paper')">{{ t('bgThemePaper') }}</button>
      </div>

      <h4>{{ t('accentH4') }}</h4>
      <div class="bgrow">
        <button v-for="a in accents" :key="a.id" class="swatch" :class="{ on: a.on }"
                :style="{ background: a.color, outline: a.on ? '2px solid var(--accent)' : '', outlineOffset: '2px' }"
                :title="t('accentName', a.id)" @click="setAccent(a.id)"></button>
      </div>
      <p class="tip">{{ t('accentTip') }}</p>

      <h4>{{ t('bgCustomH4') }}</h4>
      <div class="bgrow">
        <button @click="pickImage">{{ t('bgPick') }}</button>
        <label class="colorlab"><span>{{ t('bgColorLabel') }}</span>
          <input type="color" :value="state.bg.color" @input="setBgColor($event.target.value)"></label>
        <button @click="reset">{{ t('bgNone') }}</button>
      </div>
      <div class="bgrow">
        <button v-for="c in SWATCH" :key="c" class="swatch" :style="{ background: c }" :title="c"
                @click="setBgColor(c)"></button>
      </div>
      <p class="tip">{{ t('bgTip') }}</p>
      <div v-if="hasImage" id="bgthumb" style="display:block" :style="{ backgroundImage: `url(&quot;${ui.bgImg}&quot;)` }"></div>

      <div v-if="hasImage" id="bgadj">
        <label class="slid"><span>{{ t('bgDimLabel') }}</span> <b>{{ dimPct }}%</b>
          <input type="range" min="0" max="90" step="5" v-model="dimPct"></label>
        <label class="slid"><span>{{ t('bgBlurLabel') }}</span> <b>{{ blur }} px</b>
          <input type="range" min="0" max="24" step="1" v-model="blur"></label>
      </div>

      <p style="text-align:right;margin-top:18px"><button class="pri" @click="closeDialog">{{ t('bgOk') }}</button></p>
    </div>
  </div>
</template>
