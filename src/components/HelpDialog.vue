<script setup>
import { ref } from 'vue';
import { ui } from '../core/state.js';
import { t } from '../i18n/index.js';
import { closeDialog } from '../ui/dialogs.js';
import { startTour } from '../ui/tour.js';
import Icon from './Icon.vue';
import { X, Rocket, Grid3x3, Keyboard, FileDown, Layers, Sparkles } from 'lucide';

const PRE = `[Verse]
XXXX XXX
XXX XXXX
XX XXXXX

[Chorus]
XXXXX XXX
XXXX XXXX`;

// 文案本身带 <code> <b> <kbd> 等标记，所以走 v-html
const SECTIONS = [
  { id: 'start', nav: 'helpNavStart', icon: Rocket, blocks: [
    ['lead', 'helpIntro'],
    ['tour'],
    ['h4', 'helpCaretH4'], ['p', 'helpCaretP1'], ['p', 'helpCaretP2'],
    ['h4', 'helpBgH4'], ['p', 'helpBgP1'],
    ['ul', ['helpBgLi1', 'helpBgLi2', 'helpBgLi3']],
    ['p', 'helpBgP2'],
  ] },
  { id: 'grid', nav: 'helpNavGrid', icon: Grid3x3, blocks: [
    ['h4', 'helpGroupH4'], ['p', 'helpGroupP1'],
    ['h4', 'helpKanaH4'], ['p', 'helpKanaP1'], ['p', 'helpKanaP2'],
    ['h4', 'helpAidH4'], ['p', 'helpAidP1'], ['p', 'helpAidP2'],
    ['p', 'helpAidP3'], ['p', 'helpAidP4'],
  ] },
  { id: 'keys', nav: 'helpNavKeys', icon: Keyboard, blocks: [
    ['h4', 'helpKeysH4'],
    ['ul', ['helpKeysLi1', 'helpKeysLi2', 'helpKeysLi3', 'helpKeysLi4', 'helpKeysLi5',
            'helpKeysLi6', 'helpKeysLiShift', 'helpKeysLi7', 'helpKeysLi8']],
  ] },
  { id: 'io', nav: 'helpNavIO', icon: FileDown, blocks: [
    ['h4', 'helpImportFormatH4'], ['p', 'helpImportFormatP1'], ['pre'], ['p', 'helpImportFormatP2'],
    ['h4', 'helpMidiH4'], ['p', 'helpMidiP1'],
    ['ul', ['helpMidiLi1', 'helpMidiLi2', 'helpMidiLi3']],
    ['p', 'helpMidiP2'], ['p', 'helpMidiP3'],
    ['ul', ['helpMidiLi4', 'helpMidiLi5']],
  ] },
  { id: 'alt', nav: 'helpNavAlt', icon: Layers, blocks: [
    ['h4', 'helpAltH4'], ['p', 'helpAltP1'],
    ['ul', ['helpAltLi1', 'helpAltLi2', 'helpAltLi3', 'helpAltLi4', 'helpAltLi5']],
    ['p', 'helpAltP2'], ['p', 'helpAltP3'],
  ] },
  { id: 'ai', nav: 'helpNavAi', icon: Sparkles, blocks: [
    ['h4', 'aiHelpH4'], ['p', 'aiHelpP1'], ['p', 'aiHelpP2'], ['p', 'aiHelpP3'],
    ['note', 'aiTransNote'],
    ['warn', 'aiDisclaimer'],
  ] },
];

const sec = ref('start');
const icon = import.meta.env.BASE_URL + 'logo.png';

function tour() { closeDialog(); startTour(); }
</script>

<template>
  <div id="help" :class="{ show: ui.dialog === 'help' }" @click.self="closeDialog">
    <div class="card setcard">
      <div class="chead">
        <img class="logo" :src="icon" alt="" draggable="false">
        <h3>{{ t('helpTitleFull') }}</h3>
        <button class="cclose" :data-tip="t('helpClose')" @click="closeDialog"><Icon :node="X" :size="15" /></button>
      </div>

      <div class="setwrap">
        <nav class="setnav">
          <button v-for="x in SECTIONS" :key="x.id" :class="{ on: sec === x.id }" @click="sec = x.id">
            <Icon :node="x.icon" :size="15" /><span>{{ t(x.nav) }}</span></button>
        </nav>

        <div class="cbody setpane" :key="sec">
          <template v-for="(b, i) in SECTIONS.find(x => x.id === sec).blocks" :key="i">
            <p v-if="b[0] === 'lead'" class="helplead" v-html="t(b[1])"></p>
            <pre v-else-if="b[0] === 'pre'">{{ PRE }}</pre>
            <ul v-else-if="b[0] === 'ul'">
              <li v-for="k in b[1]" :key="k" v-html="t(k)"></li>
            </ul>
            <h4 v-else-if="b[0] === 'h4'" v-html="t(b[1])"></h4>
            <div v-else-if="b[0] === 'warn'" class="disclaimer" v-html="t(b[1])"></div>
            <p v-else-if="b[0] === 'note'" class="ainote" v-show="t(b[1])" v-html="t(b[1])"></p>
            <button v-else-if="b[0] === 'tour'" class="pri tourbtn" @click="tour">
              <Icon :node="Rocket" :size="14" /> {{ t('tourStart') }}</button>
            <p v-else v-html="t(b[1])"></p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
