<script setup>
import { ui } from '../core/state.js';
import { t } from '../i18n/index.js';
import { closeDialog } from '../ui/dialogs.js';

const PRE = `[Verse]
XXXX XXX
XXX XXXX
XX XXXXX

[Chorus]
XXXXX XXX
XXXX XXXX`;

// 文案本身带 <code> <b> <kbd> 等标记，所以走 v-html
const BLOCKS = [
  ['p', 'helpIntro'],
  ['h4', 'helpImportFormatH4'], ['p', 'helpImportFormatP1'], ['pre'], ['p', 'helpImportFormatP2'],
  ['h4', 'helpMidiH4'], ['p', 'helpMidiP1'],
  ['ul', ['helpMidiLi1', 'helpMidiLi2', 'helpMidiLi3']],
  ['p', 'helpMidiP2'], ['p', 'helpMidiP3'],
  ['ul', ['helpMidiLi4', 'helpMidiLi5']],
  ['h4', 'helpKeysH4'],
  ['ul', ['helpKeysLi1', 'helpKeysLi2', 'helpKeysLi3', 'helpKeysLi4', 'helpKeysLi5',
          'helpKeysLi6', 'helpKeysLiShift', 'helpKeysLi7', 'helpKeysLi8']],
  ['h4', 'helpBgH4'], ['p', 'helpBgP1'],
  ['ul', ['helpBgLi1', 'helpBgLi2', 'helpBgLi3']],
  ['p', 'helpBgP2'],
  ['h4', 'helpCaretH4'], ['p', 'helpCaretP1'], ['p', 'helpCaretP2'],
  ['h4', 'helpGroupH4'], ['p', 'helpGroupP1'],
  ['h4', 'helpKanaH4'], ['p', 'helpKanaP1'], ['p', 'helpKanaP2'],
  ['h4', 'helpAltH4'], ['p', 'helpAltP1'],
  ['ul', ['helpAltLi1', 'helpAltLi2', 'helpAltLi3', 'helpAltLi4', 'helpAltLi5']],
  ['p', 'helpAltP2'], ['p', 'helpAltP3'],
  ['h4', 'aiHelpH4'], ['p', 'aiHelpP1'], ['p', 'aiHelpP2'], ['p', 'aiHelpP3'],
  ['p-warn', 'aiDisclaimer'],
];

const icon = import.meta.env.BASE_URL + 'favicon.png';
</script>

<template>
  <div id="help" :class="{ show: ui.dialog === 'help' }" @click.self="closeDialog">
    <div class="card">
      <div class="cardhead">
        <img class="logo" :src="icon" alt="">
        <h3>{{ t('helpTitleFull') }}</h3>
      </div>

      <template v-for="(b, i) in BLOCKS" :key="i">
        <pre v-if="b[0] === 'pre'">{{ PRE }}</pre>
        <ul v-else-if="b[0] === 'ul'">
          <li v-for="k in b[1]" :key="k" v-html="t(k)"></li>
        </ul>
        <h4 v-else-if="b[0] === 'h4'" v-html="t(b[1])"></h4>
        <p v-else-if="b[0] === 'p-warn'" style="color:var(--ovf)" v-html="t(b[1])"></p>
        <p v-else v-html="t(b[1])"></p>
      </template>

      <p class="ainote" v-if="t('aiTransNote')" v-html="t('aiTransNote')"></p>

      <p class="credit">
        <span v-html="t('creditLine')"></span><br>
        <a class="me" href="https://response.run/" target="_blank" rel="noopener">response.run</a>
      </p>

      <p style="text-align:right;margin-top:20px"><button @click="closeDialog">{{ t('helpClose') }}</button></p>
    </div>
  </div>
</template>
