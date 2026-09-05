<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { t } from '../i18n/index.js';
import { toast } from '../ui/toast.js';
import { ctx, closeCtx, ctxCopy, ctxCut, ctxPaste, ctxSelectAll } from '../ui/ctxmenu.js';
import Icon from './Icon.vue';
import { Scissors, Copy, ClipboardPaste, TextSelect } from 'lucide';

const box = ref(null);
const pos = ref({ left: '0px', top: '0px' });

const items = computed(() => [
  { id: 'cut', icon: Scissors, label: 'ctxCut', on: !!(ctx.field && ctx.sel), run: ctxCut },
  { id: 'copy', icon: Copy, label: 'ctxCopy', on: !!ctx.sel, run: ctxCopy },
  { id: 'paste', icon: ClipboardPaste, label: 'ctxPaste', on: !!ctx.field, run: paste },
  { id: 'all', icon: TextSelect, label: 'ctxSelectAll', on: !!ctx.field, run: ctxSelectAll },
]);

async function paste() {
  try { await ctxPaste(); } catch (e) { toast(t('toastPasteFail')); }
}

async function pick(item) {
  if (!item.on) return;
  const f = ctx.field;
  try { await item.run(); } finally { closeCtx(); f?.focus(); }
}

// 贴着光标弹出，超出视口就翻到另一侧
watch(() => ctx.shown, async on => {
  if (!on) return;
  pos.value = { left: ctx.x + 'px', top: ctx.y + 'px' };
  await nextTick();
  const r = box.value?.getBoundingClientRect();
  if (!r) return;
  const pad = 8;
  const x = ctx.x + r.width + pad > innerWidth ? Math.max(pad, ctx.x - r.width) : ctx.x;
  const y = ctx.y + r.height + pad > innerHeight ? Math.max(pad, ctx.y - r.height) : ctx.y;
  pos.value = { left: x + 'px', top: y + 'px' };
});
</script>

<template>
  <div v-if="ctx.shown" class="ctxmask" @pointerdown="closeCtx" @contextmenu.prevent="closeCtx"></div>
  <div v-if="ctx.shown" ref="box" class="menu ctxmenu show" :style="pos">
    <button v-for="it in items" :key="it.id" :disabled="!it.on" @click="pick(it)">
      <Icon :node="it.icon" :size="15" /><span>{{ t(it.label) }}</span></button>
  </div>
</template>
