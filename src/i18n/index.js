import { state } from '../core/state.js';
export { I18N } from './dict.js';
import { I18N } from './dict.js';

function t(key, ...args){
  const dict = I18N[state.lang] || I18N.zh;
  const v = dict[key] !== undefined ? dict[key] : I18N.zh[key];
  return typeof v === "function" ? v(...args) : v;
}

const LANG_NAME = { zh:"中文", zhHant:"繁體中文", ja:"日本語", ko:"한국어" };

const LOCALE = { zh:"zh-CN", zhHant:"zh-TW", ja:"ja-JP", ko:"ko-KR" };

export { t, LANG_NAME, LOCALE };
