<script setup>
import { state } from '../core/state.js';
import { t } from '../i18n/index.js';
import { openDialog } from '../ui/dialogs.js';
import { toggleMenu } from '../ui/menu.js';
import { aiUi, aiOpenPanel, aiClosePanel } from '../ai.js';
import Icon from './Icon.vue';
import { toggleAid } from '../ui/aid.js';
import { ChevronDown, CircleHelp, Settings, SpellCheck } from 'lucide';

defineProps({
  onNew: Function, onOpenProj: Function, onSaveProj: Function,
  onImpTxt: Function, onImpMidi: Function, onImpSvp: Function,
  onExpPat: Function, onExpMidiClean: Function, onExpMidiLyr: Function,
  onReflow: Function,
});

// 运行中点顶栏按钮总是打开面板（方便回来看进度/停止）空闲时才是开关
function toggleAi() {
  if (!aiUi.shown) aiOpenPanel();
  else aiClosePanel();
}
</script>

<template>
  <div class="bar">
    <button @click="onNew">{{ t('btnNew') }}</button>
    <button @click="onOpenProj">{{ t('btnImpProj') }}</button>
    <button @click="onSaveProj">{{ t('btnExpProj') }}</button>
    <div class="sep"></div>

    <div class="menuwrap">
      <button class="menubtn" @click="toggleMenu($event, 'impMenu')">
        <span>{{ t('btnImpMenu') }}</span><Icon :node="ChevronDown" :size="13" class="car" /></button>
      <div class="menu" id="impMenu">
        <button @click="onImpTxt">{{ t('btnImpTxt') }}</button>
        <button :data-tip="t('btnImpMidiTitle')" @click="onImpMidi">{{ t('btnImpMidi') }}</button>
        <button :data-tip="t('btnImpSvpTitle')" @click="onImpSvp">{{ t('btnImpSvp') }}</button>
      </div>
    </div>

    <div class="menuwrap">
      <button class="menubtn pri" @click="toggleMenu($event, 'expMenu')">
        <span>{{ t('btnExpMenu') }}</span><Icon :node="ChevronDown" :size="13" class="car" /></button>
      <div class="menu" id="expMenu">
        <button class="pri" @click="openDialog('exp')">{{ t('btnExpLyr') }}</button>
        <button @click="onExpPat">{{ t('btnExpPat') }}</button>
        <button :data-tip="t('btnExpLrcTitle')" @click="openDialog('lrc')">{{ t('btnExpLrc') }}</button>
        <div class="msep"></div>
        <button :data-tip="t('btnExpMidiCleanTitle')" @click="onExpMidiClean">{{ t('btnExpMidiClean') }}</button>
        <button :data-tip="t('btnExpMidiLyrTitle')" @click="onExpMidiLyr">{{ t('btnExpMidiLyr') }}</button>
      </div>
    </div>

    <div class="grow"></div>
    <button :data-tip="t('btnReflowTitle')" @click="onReflow">{{ t('btnReflow') }}</button>
    <button :class="{ 'ai-running': aiUi.busy }" @click="toggleAi"
            :data-tip="aiUi.busy ? t('aiBtnRunningTitle') : t('aiBtnTitle')">
      {{ aiUi.busy ? t('aiBtnRunning') : t('aiBtn') }}</button>
    <button :class="{ on: state.aid }" :data-tip="t('aidTitle')" @click="toggleAid">
      <Icon :node="SpellCheck" /></button>
    <button :data-tip="t('setTitle')" @click="openDialog('settings')"><Icon :node="Settings" /></button>
    <button :data-tip="t('helpTitleFull')" @click="openDialog('help')"><Icon :node="CircleHelp" /></button>
  </div>
</template>
