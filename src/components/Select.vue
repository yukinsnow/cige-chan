<script setup>
import { ref, computed, onUnmounted, nextTick } from 'vue';
import Icon from './Icon.vue';
import { ChevronDown, Check } from 'lucide';

/* 原生 select 的下拉列表由系统渲染、脱离页面层叠，在弹层上会盖住内容，
   各平台外观也不一致。这里自绘一个，行为对齐原生：键盘可用、点外面收起。 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },   // [{ v, label }]
  disabled: Boolean,
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const box = ref(null);
const cur = computed(() => props.options.find(o => o.v === props.modelValue));
const label = computed(() => cur.value?.label ?? '');

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) nextTick(() => box.value?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }));
}
function pick(o) { emit('update:modelValue', o.v); open.value = false; }

function onKey(e) {
  if (props.disabled) return;
  const i = props.options.findIndex(o => o.v === props.modelValue);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = props.options[Math.max(0, Math.min(props.options.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) emit('update:modelValue', next.v);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); toggle();
  } else if (e.key === 'Escape') {
    open.value = false;
  }
}

const away = e => { if (!e.target.closest?.('.sel-wrap')) open.value = false; };
addEventListener('click', away);
onUnmounted(() => removeEventListener('click', away));
</script>

<template>
  <span class="sel-wrap">
    <button class="sel-btn" :disabled="disabled" @click.stop="toggle" @keydown="onKey">
      <span class="sel-val">{{ label }}</span>
      <Icon :node="ChevronDown" :size="13" class="car" :class="{ up: open }" />
    </button>
    <div v-if="open" ref="box" class="menu sel-list show">
      <button v-for="o in options" :key="o.v" :class="{ on: o.v === modelValue }" @click.stop="pick(o)">
        <span>{{ o.label }}</span>
        <Icon v-if="o.v === modelValue" :node="Check" :size="14" />
      </button>
    </div>
  </span>
</template>
