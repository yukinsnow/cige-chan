<script setup>
import { ref, computed, nextTick } from 'vue';
import Icon from './Icon.vue';
import { Pencil } from 'lucide';
import { state } from '../core/state.js';
import { t } from '../i18n/index.js';
import { save } from '../core/persist.js';

const editing = ref(false);
const draft = ref('');
const box = ref(null);

// field-sizing:content 在老 WebView 上没有，宽度自己量：ghost 跟 input 同字体
const shown = computed(() => editing.value ? (draft.value || " ") : state.title);

async function startEdit() {
  draft.value = state.title;
  editing.value = true;
  await nextTick();
  box.value?.focus(); box.value?.select();
}
function commit() {
  if (!editing.value) return;
  editing.value = false;
  const v = draft.value.trim();
  if (v && v !== state.title) { state.title = v; save(); }
}

const icon = import.meta.env.BASE_URL + 'logo.png';
</script>

<template>
  <div class="tstrip" data-tauri-drag-region="deep">
    <img class="logo" :src="icon" alt="" draggable="false">
    <span class="tag">{{ t('brand') }}</span>
    <span class="titlebox">
      <span class="tghost" aria-hidden="true">{{ shown }}</span>
      <input v-if="editing" id="title" ref="box" v-model="draft" spellcheck="false"
             @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = false" @blur="commit">
      <span v-else class="songtitle" :data-tip="state.title">{{ state.title }}</span>
    </span>
    <button class="titleedit" :class="{ hide: editing }" :data-tip="t('titleEdit')" @click="startEdit">
      <Icon :node="Pencil" :size="13" /></button>
  </div>
</template>
