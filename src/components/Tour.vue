<script setup>
import { computed } from 'vue';
import { t } from '../i18n/index.js';
import { tour, endTour } from '../ui/tour.js';
import Icon from './Icon.vue';
import { ArrowRight, ArrowLeft, Check } from 'lucide';

/* 每步配一个用真实 .cell 样式搭的小演示——讲词格用图比用话省一半字。
   demo 决定右侧画什么：grid 空格子 / typed 填了字 / partial 只填句尾 / alts 备选行 / io 导出 */
const STEPS = [
  { h: 'tour1H', p: 'tour1P', demo: 'logo' },
  { h: 'tour2H', p: 'tour2P', demo: 'grid' },
  { h: 'tour3H', p: 'tour3P', demo: 'partial' },
  { h: 'tour4H', p: 'tour4P', demo: 'alts' },
  { h: 'tour5H', p: 'tour5P', demo: 'export' },
];

const cur = computed(() => STEPS[tour.step]);
const last = computed(() => tour.step === STEPS.length - 1);
const icon = import.meta.env.BASE_URL + 'logo.png';

const G = [4, 4, 5];
const FILLED = [...'细雨微澜长街薄暮伞下照红绫'];
// 只填句尾五格，前面留空——对应第三步说的那件事
const TAIL = G.flatMap((n, gi) => Array(n).fill('').map((_, i) => gi === 2 ? '伞下照红绫'[i] : ''));

function next() { last.value ? endTour() : tour.step++; }
</script>

<template>
  <div v-if="tour.shown" class="tourmask">
    <div class="tourcard">
      <div class="tourbody">
        <div class="tourtext">
          <p class="tourstep">{{ tour.step + 1 }} / {{ STEPS.length }}</p>
          <h2>{{ t(cur.h) }}</h2>
          <p class="tourp" v-html="t(cur.p)"></p>
        </div>

        <div class="tourdemo">
          <img v-if="cur.demo === 'logo'" class="tourlogo" :src="icon" alt="" draggable="false">

          <div v-else class="demogrid">
            <template v-if="cur.demo === 'grid' || cur.demo === 'alts' || cur.demo === 'export'">
              <span class="demopat">4/4/5</span>
              <div class="demorow">
                <div class="demogrp" v-for="(n, gi) in G" :key="gi">
                  <div class="cell" v-for="i in n" :key="i">{{ FILLED[G.slice(0, gi).reduce((a, b) => a + b, 0) + i - 1] }}</div>
                </div>
              </div>
            </template>

            <template v-if="cur.demo === 'partial'">
              <span class="demopat">4/4/5</span>
              <div class="demorow">
                <div class="demogrp" v-for="(n, gi) in G" :key="gi">
                  <div class="cell" :class="{ caret: gi === 2 && i === 1 }"
                       v-for="i in n" :key="i">{{ TAIL[G.slice(0, gi).reduce((a, b) => a + b, 0) + i - 1] }}</div>
                </div>
              </div>
            </template>

            <div v-if="cur.demo === 'alts'" class="demotools">
              <span class="vlab">{{ t('versionLabel') }}</span>
              <button class="vc on">1</button>
              <button class="vc">2</button>
              <button class="vadd">{{ t("addAlt") }}</button>
            </div>

            <div v-if="cur.demo === 'export'" class="demotools">
              <button class="pri">{{ t('btnExpLyr') }}</button>
              <button>{{ t('btnExpPat') }}</button>
              <button>{{ t('btnExpMidiLyr') }}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="tourfoot">
        <button class="linkbtn" @click="endTour">{{ t('tourSkip') }}</button>
        <span class="tourdots">
          <i v-for="(s, i) in STEPS" :key="i" :class="{ on: i === tour.step }" @click="tour.step = i"></i>
        </span>
        <button v-if="tour.step" @click="tour.step--"><Icon :node="ArrowLeft" :size="14" /> {{ t('tourBack') }}</button>
        <button class="pri" @click="next">
          {{ last ? t('tourDone') : t('tourNext') }}
          <Icon :node="last ? Check : ArrowRight" :size="14" /></button>
      </div>
    </div>
  </div>
</template>
