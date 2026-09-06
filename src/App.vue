<script setup>
import Toolbar from './components/Toolbar.vue';
import TitleStrip from './components/TitleStrip.vue';
import WindowControls from './components/WindowControls.vue';
import WordGrid from './components/WordGrid.vue';
import StatsBar from './components/StatsBar.vue';
import SaveStatus from './components/SaveStatus.vue';
import Credits from './components/Credits.vue';
import HelpDialog from './components/HelpDialog.vue';
import ExportDialog from './components/ExportDialog.vue';
import LrcDialog from './components/LrcDialog.vue';
import BreakDialog from './components/BreakDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import DropHint from './components/DropHint.vue';
import ContextMenu from './components/ContextMenu.vue';
import Tour from './components/Tour.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PickDialog from './components/PickDialog.vue';
import AiPanel from './components/AiPanel.vue';

import { isDesktopApp } from './platform/env.js';

defineProps({
  onNew: Function, onOpenProj: Function, onSaveProj: Function,
  onImpTxt: Function, onImpMidi: Function, onImpSvp: Function,
  onExpPat: Function, onExpMidiClean: Function, onExpMidiLyr: Function,
  onReflow: Function, onCell: Function, onReadTiming: Function,
});
</script>

<template>
  <WindowControls v-if="isDesktopApp" />
  <header>
    <TitleStrip />
    <Toolbar :on-new="onNew" :on-open-proj="onOpenProj" :on-save-proj="onSaveProj"
             :on-imp-txt="onImpTxt" :on-imp-midi="onImpMidi" :on-imp-svp="onImpSvp"
             :on-exp-pat="onExpPat" :on-exp-midi-clean="onExpMidiClean"
             :on-exp-midi-lyr="onExpMidiLyr" :on-reflow="onReflow" :on-cell="onCell" />
  </header>

  <WordGrid />

  <footer>
    <StatsBar />
    <div class="bar-r">
      <span id="saved"><SaveStatus /></span>
      <span class="dot"></span>
      <Credits />
    </div>
  </footer>

  <HelpDialog />
  <ExportDialog />
  <LrcDialog :on-read-timing="onReadTiming" />
  <BreakDialog />
  <SettingsDialog />
  <DropHint />
  <ContextMenu />
  <Tour />
  <ConfirmDialog />
  <PickDialog />
  <AiPanel />
</template>
