<script setup>
defineProps({ node: { type: Array, required: true }, size: { type: [Number, String], default: 15 } });
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="size" :height="size" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <component v-for="([tag, attrs], i) in node" :key="i" :is="tag" v-bind="attrs" />
  </svg>
</template>
