<script setup>
import { computed } from 'vue';
import { ui } from '../core/state.js';
import { t } from '../i18n/index.js';
import { closeDialog } from '../ui/dialogs.js';
import Icon from './Icon.vue';
import { X, Palette, Sparkles, Languages, Info } from 'lucide';
import AppearancePane from './settings/AppearancePane.vue';
import LlmPane from './settings/LlmPane.vue';
import LangPane from './settings/LangPane.vue';
import AboutPane from './settings/AboutPane.vue';

// 左侧分类 + 右侧内容，不用级联子菜单——那个在触屏上点不中
const TABS = [
  { id: 'look', label: 'setAppearance', icon: Palette, pane: AppearancePane },
  { id: 'llm', label: 'setLlm', short: 'setLlmShort', icon: Sparkles, pane: LlmPane },
  { id: 'lang', label: 'setLang', icon: Languages, pane: LangPane },
  { id: 'about', label: 'setAbout', icon: Info, pane: AboutPane },
];
const tab = computed({
  get: () => ui.settingsTab,
  set: v => { ui.settingsTab = v; },
});
</script>

<template>
  <div id="settings" :class="{ show: ui.dialog === 'settings' }" @click.self="closeDialog">
    <div class="card setcard">
      <div class="chead">
        <h3>{{ t('setTitle') }}</h3>
        <button class="cclose" :data-tip="t('setDone')" @click="closeDialog"><Icon :node="X" :size="15" /></button>
      </div>
      <div class="setwrap">
        <nav class="setnav">
          <button v-for="x in TABS" :key="x.id" :class="{ on: tab === x.id }" @click="tab = x.id">
            <Icon :node="x.icon" :size="15" />
            <span class="navfull">{{ t(x.label) }}</span>
            <span class="navshort">{{ t(x.short || x.label) }}</span></button>
        </nav>
        <div class="cbody setpane">
          <component :is="TABS.find(x => x.id === tab).pane" />
        </div>
      </div>
    </div>
  </div>
</template>
