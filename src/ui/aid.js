import { state, redraw } from '../core/state.js';
import { loadRhyme } from '../core/rhyme.js';
import { save } from '../core/persist.js';
import { t } from '../i18n/index.js';
import { toast } from './toast.js';

/* 平仄押韵辅助的总开关。表有 55KB，第一次打开才去拉，
   拉失败就把开关退回去——不然界面上写着「开」但什么都不显示。 */
export async function toggleAid() {
  if (state.aid) { state.aid = false; save(); redraw(); return; }
  const ok = await loadRhyme();
  if (!ok) { toast(t('aidLoadFail')); return; }
  state.aid = true; save(); redraw();
}

// 上次开着的话进来就要接着显示；开关本来是关的就别白重画一次
export async function initAid() {
  if (!state.aid) return false;
  if (await loadRhyme()) return true;
  state.aid = false;
  return false;
}
