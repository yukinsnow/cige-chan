<script setup>
import { computed } from 'vue';
import { state, redraw } from '../core/state.js';
import { I18N, t, LANG_NAME } from '../i18n/index.js';
import { save } from '../core/persist.js';
import { openDialog } from '../ui/dialogs.js';
import { toggleMenu, closeAllMenus } from '../ui/menu.js';
import { aiUi, aiOpenPanel, aiClosePanel } from '../ai.js';

const props = defineProps({
  onNew: Function, onOpenProj: Function, onSaveProj: Function,
  onImpTxt: Function, onImpMidi: Function,
  onExpPat: Function, onExpMidiClean: Function, onExpMidiLyr: Function,
  onReflow: Function, onCell: Function,
});

const icon = document.querySelector('link[rel="icon"]')?.href || '';
const langLabel = computed(() => LANG_NAME[state.lang] || LANG_NAME.zh);

const title = computed({
  get: () => state.title,
  set: v => { state.title = v; save(); },
});

// 运行中点顶栏按钮总是打开面板（方便回来看进度/停止）空闲时才是开关
function toggleAi() {
  if (!aiUi.shown) aiOpenPanel();
  else aiClosePanel();
}

function setLang(lang) {
  // 标题还是各语言默认的「未命名」占位符时跟着语言一起换 自己写过就不动
  const wasDefault = Object.values(I18N).some(d => d.untitled === state.title);
  state.lang = lang;
  if (wasDefault) state.title = t('untitled');
  redraw(); save(); closeAllMenus();
}
</script>

<template>
  <div class="bar">
    <img class="logo" :src="icon" alt="">
    <span class="tag">{{ t('brand') }}</span>
    <input id="title" v-model="title" spellcheck="false">
    <div class="sep"></div>
    <button @click="onNew">{{ t('btnNew') }}</button>
    <button @click="onOpenProj">{{ t('btnImpProj') }}</button>
    <button @click="onSaveProj">{{ t('btnExpProj') }}</button>
    <div class="sep"></div>

    <div class="menuwrap">
      <button class="menubtn" @click="toggleMenu($event, 'impMenu')">
        <span>{{ t('btnImpMenu') }}</span><i class="car">▾</i></button>
      <div class="menu" id="impMenu">
        <button @click="onImpTxt">{{ t('btnImpTxt') }}</button>
        <button :title="t('btnImpMidiTitle')" @click="onImpMidi">{{ t('btnImpMidi') }}</button>
      </div>
    </div>

    <div class="menuwrap">
      <button class="menubtn pri" @click="toggleMenu($event, 'expMenu')">
        <span>{{ t('btnExpMenu') }}</span><i class="car">▾</i></button>
      <div class="menu" id="expMenu">
        <button class="pri" @click="openDialog('exp')">{{ t('btnExpLyr') }}</button>
        <button @click="onExpPat">{{ t('btnExpPat') }}</button>
        <div class="msep"></div>
        <button :title="t('btnExpMidiCleanTitle')" @click="onExpMidiClean">{{ t('btnExpMidiClean') }}</button>
        <button :title="t('btnExpMidiLyrTitle')" @click="onExpMidiLyr">{{ t('btnExpMidiLyr') }}</button>
      </div>
    </div>

    <div class="grow"></div>
    <button :title="t('btnReflowTitle')" @click="onReflow">{{ t('btnReflow') }}</button>
    <button :class="{ 'ai-running': aiUi.busy }" @click="toggleAi"
            :title="aiUi.busy ? t('aiBtnRunningTitle') : t('aiBtnTitle')">
      {{ aiUi.busy ? t('aiBtnRunning') : t('aiBtn') }}</button>
    <button @click="onCell(-4)">{{ t('btnSmall') }}</button><button @click="onCell(4)">{{ t('btnBig') }}</button>
    <button @click="openDialog('bgPanel')">{{ t('btnBg') }}</button>

    <div class="menuwrap">
      <button class="menubtn" title="Language / 言語 / 언어" @click="toggleMenu($event, 'langMenu')">
        <span>{{ langLabel }}</span><i class="car">▾</i></button>
      <div class="menu" id="langMenu">
        <button v-for="(name, code) in LANG_NAME" :key="code" @click="setLang(code)">{{ name }}</button>
      </div>
    </div>

    <button @click="openDialog('help')">?</button>
  </div>
</template>
