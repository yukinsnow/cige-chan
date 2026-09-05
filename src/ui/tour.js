import { reactive } from 'vue';

const SEEN = 'cige.tour.v1';

export const tour = reactive({ shown: false, step: 0 });

export const startTour = () => { tour.step = 0; tour.shown = true; };

export function endTour() {
  tour.shown = false;
  try { localStorage.setItem(SEEN, '1'); } catch (e) {}
}

// 只在真正第一次打开时自动弹：既没看过引导，也没有存过工程
export function maybeStartTour() {
  try {
    if (localStorage.getItem(SEEN) || localStorage.getItem('cige.v1')) return;
  } catch (e) { return; }
  startTour();
}
