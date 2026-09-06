<script setup>
import { ref, watch } from 'vue';
import { pick, closePick } from '../ui/pick.js';
import { t } from '../i18n/index.js';
import Icon from './Icon.vue';
import { X, Check } from 'lucide';

const sel = ref(new Set());
watch(() => pick.shown, on => { if (on) sel.value = new Set(pick.preset ?? []); });

function toggle(v) {
  const s = new Set(sel.value);
  s.has(v) ? s.delete(v) : s.add(v);
  sel.value = s;
}
</script>

<template>
  <div v-if="pick.shown" id="pickdlg" @click.self="closePick(null)">
    <div class="card askcard">
      <div class="chead">
        <h3>{{ pick.title }}</h3>
        <button class="cclose" @click="closePick(null)"><Icon :node="X" :size="15" /></button>
      </div>
      <div class="cbody">
        <p v-if="pick.hint" class="tip" style="margin:0 0 10px">{{ pick.hint }}</p>
        <div class="setlist">
          <button v-for="o in pick.options" :key="o.v"
                  :class="{ on: pick.multi ? sel.has(o.v) : false }"
                  @click="pick.multi ? toggle(o.v) : closePick(o.v)">
            <span class="pickrow">
              <span class="pickname">{{ o.label }}</span>
              <Icon v-if="pick.multi && sel.has(o.v)" :node="Check" :size="15" />
            </span>
            <span class="pickdesc">{{ o.desc }}</span>
          </button>
        </div>
      </div>
      <div v-if="pick.multi" class="cfoot">
        <button @click="closePick(null)">{{ t('askCancel') }}</button>
        <button class="pri" :disabled="!sel.size" @click="closePick([...sel])">
          {{ t('svpPickOk', sel.size) }}</button>
      </div>
    </div>
  </div>
</template>
