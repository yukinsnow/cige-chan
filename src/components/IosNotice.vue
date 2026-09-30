<script setup>
import { ref } from 'vue';
import { t } from '../i18n/index.js';
import { TAURI } from '../platform/save.js';
import { isIOS } from '../platform/env.js';
import Icon from './Icon.vue';
import { TriangleAlert, X } from 'lucide';

const SEEN = 'cige.iosnote.v1';

/* Safari 里连续 7 天没打开的站点 localStorage 会被清掉，稿子全在里面。
   加到主屏幕的 web app 不受这条限制，客户端走 app 容器也不受 */
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
let seen = false;
try { seen = !!localStorage.getItem(SEEN); } catch (e) {}
const shown = ref(isIOS && !TAURI && !standalone && !seen);

function close() {
  shown.value = false;
  try { localStorage.setItem(SEEN, '1'); } catch (e) {}
}
</script>

<template>
  <div v-if="shown" class="iosnote">
    <Icon :node="TriangleAlert" :size="15" class="iosicon" />
    <p v-html="t('iosNote')"></p>
    <button class="cclose" :data-tip="t('helpClose')" @click="close"><Icon :node="X" :size="14" /></button>
  </div>
</template>
