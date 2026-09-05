<script setup>
import { computed } from 'vue';
import { state, ui } from '../../core/state.js';
import { t } from '../../i18n/index.js';
import { save } from '../../core/persist.js';
import { ACCENTS, SWATCH, isDark, applyAccent, applyBg, saveBg, setBgColor } from '../../core/theme.js';
import { toast } from '../../ui/toast.js';
import { pickImage } from '../../platform/open.js';

const dark = computed(() => isDark());
const hasImage = computed(() => state.bg.mode === 'image' && !!ui.bgImg);
const accents = computed(() => ACCENTS.map(a => ({
  id: a.id,
  color: dark.value ? a.dark : a.light,
  on: a.id === (state.accent || 'auto'),
})));

const slide = (get, set) => computed({ get, set: v => { set(+v); applyBg(); save(); } });
const dimPct = slide(() => Math.round(state.bg.dim * 100), v => { state.bg.dim = v / 100; });
const blur = slide(() => state.bg.blur, v => { state.bg.blur = v; });
const cell = computed({
  get: () => state.cell,
  set: v => {
    state.cell = Math.max(28, Math.min(72, +v));
    document.documentElement.style.setProperty('--cell', state.cell + 'px');
    save();
  },
});

function setTheme(th) { state.theme = th; applyBg(); save(); }
function setAccent(id) { state.accent = id; applyAccent(); save(); }
function reset() {
  state.bg.mode = 'none'; ui.bgImg = '';
  applyBg(); saveBg(); save(); toast(t('toastBgReset'));
}
</script>

<template>
  <h4>{{ t('bgThemeH4') }}</h4>
  <div class="bgrow">
    <button class="pre" :class="{ on: state.theme === 'system' }" @click="setTheme('system')">{{ t('bgThemeSystem') }}</button>
    <button class="pre" :class="{ on: state.theme === 'light' }" @click="setTheme('light')">{{ t('bgThemePaper') }}</button>
    <button class="pre" :class="{ on: state.theme === 'dark' }" @click="setTheme('dark')">{{ t('bgThemeDark') }}</button>
  </div>

  <h4>{{ t('accentH4') }}</h4>
  <div class="bgrow">
    <button v-for="a in accents" :key="a.id" class="swatch" :class="{ on: a.on }"
            :style="{ background: a.color, outline: a.on ? '2px solid var(--accent)' : '', outlineOffset: '2px' }"
            :data-tip="t('accentName', a.id)" @click="setAccent(a.id)"></button>
  </div>
  <p class="tip">{{ t('accentTip') }}</p>

  <h4>{{ t('setCellH4') }}</h4>
  <label class="slid"><span>{{ t('setCellH4') }}</span> <b>{{ cell }} px</b>
    <input type="range" min="28" max="72" step="2" v-model="cell"></label>
  <p class="tip">{{ t('setCellTip') }}</p>

  <h4>{{ t('bgCustomH4') }}</h4>
  <div class="bgrow">
    <button @click="pickImage">{{ t('bgPick') }}</button>
    <label class="colorlab"><span>{{ t('bgColorLabel') }}</span>
      <input type="color" :value="state.bg.color" @input="setBgColor($event.target.value)"></label>
    <button @click="reset">{{ t('bgNone') }}</button>
  </div>
  <div class="bgrow">
    <button v-for="c in SWATCH" :key="c" class="swatch" :style="{ background: c }" :data-tip="c"
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
</template>
