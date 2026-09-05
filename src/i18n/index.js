import { state } from '../core/state.js';

const I18N = {};
const LANG_NAME = {};
const LOCALE = {};

// 就地填充 别改成重新赋值 别的模块 import 的是同一个引用
function install(dicts) {
  Object.assign(I18N, dicts);
  for (const k of Object.keys(LANG_NAME)) delete LANG_NAME[k];
  for (const k of Object.keys(LOCALE)) delete LOCALE[k];
  for (const [k, d] of Object.entries(I18N).sort((a, b) => (a[1]._order ?? 99) - (b[1]._order ?? 99))) {
    LANG_NAME[k] = d._name || k;
    LOCALE[k] = d._locale || 'zh-CN';
  }
}

async function loadLocales() {
  const base = import.meta.env.BASE_URL;
  const list = await (await fetch(base + 'i18n/index.json')).json();
  const got = await Promise.all(list.map(async code => {
    const r = await fetch(base + 'i18n/' + code + '.json');
    if (!r.ok) throw new Error(code + '.json ' + r.status);
    return [code, await r.json()];
  }));
  install(Object.fromEntries(got));
}

function t(key, ...args) {
  const dict = I18N[state.lang] || I18N.zh || {};
  const fb = I18N.zh || {};
  const v = dict[key] !== undefined ? dict[key] : fb[key];
  // accentName 那种查表型 第一个参数当键
  if (v && typeof v === 'object') return v[args[0]] || args[0];
  if (typeof v !== 'string' || !args.length) return v;
  return v.replace(/\{(\d+)\}/g, (m, i) => args[i] !== undefined ? args[i] : m);
}

export { I18N, t, LANG_NAME, LOCALE, install, loadLocales };
