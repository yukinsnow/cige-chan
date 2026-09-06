import { CL, RT, cap } from './clusters.js';

// 汉字 → 韵组 + 声调。表 55KB 放 public/rhyme.json 懒加载 不进 bundle
let T = null;
let MULTI = new Map();
let loading = null;

function install(json) {
  T = json;
  // 多音字建索引 词格每改一个字都要重画整行 不能每格去串里线性找
  MULTI = new Map([...json.mc].map((ch, i) => [ch, json.mr.substr(i * json.mw, json.mw).trimEnd()]));
}

function loadRhyme() {
  if (T) return Promise.resolve(true);
  if (!loading) loading = fetch(import.meta.env.BASE_URL + 'rhyme.json')
    .then(r => r.ok ? r.json() : Promise.reject(new Error('rhyme.json ' + r.status)))
    .then(j => { install(j); return true; })
    .catch(() => { loading = null; return false; });
  return loading;
}

const ready = () => !!T;
const rhymeName = i => T?.y[i] ?? '';

/* r 是按码位下标存的 所以查表要先减 T.lo，空格表示这个码位没字。
   多音字不在 r 里 只存主读音 全部读音在 MULTI。格式见 scripts/gen-rhyme.mjs。 */
function reads(ch) {
  if (!T || !ch) return null;
  const cp = ch.codePointAt(0);
  const i = cp - T.lo;
  if (i < 0 || i >= T.r.length) return null;
  const one = T.r[i];
  if (one === ' ') return null;
  const codes = MULTI.get(ch) || one;
  return [...codes].map(c => {
    const v = c.charCodeAt(0) - 48;
    return { y: (v / 5) | 0, tone: v % 5 };
  });
}

const cls = tone => (tone === 1 || tone === 2) ? 'ping' : (tone === 3 || tone === 4) ? 'ze' : 'light';

/* 平仄只看主读音：表里「的」还带 dí dì、「着」带 zháo zhuó，
   一视同仁的话满篇都是「两读」，反而看不出东西。异读另开一个标记提示。 */
function pz(ch) {
  const rs = reads(ch);
  return rs ? cls(rs[0].tone) : '';
}

// 异读跨了平仄才提示（重 zhòng/chóng），只是韵不同的不算（行 xíng/háng 都是平）
function pzAmbig(ch) {
  const rs = reads(ch);
  if (!rs || rs.length < 2) return false;
  const set = new Set(rs.map(r => cls(r.tone)).filter(x => x !== 'light'));
  return set.size > 1;
}

// 一句的韵脚是末字 没填满就取已填的最后一个字
function tailChar(L) {
  const cl = CL(RT(L.t)).slice(0, cap(L));
  for (let i = cl.length - 1; i >= 0; i--) {
    const c = cl[i];
    if (c && c !== ' ' && c !== '　') return c;
  }
  return '';
}

/* 整篇的韵脚分组。槽位号按押得多少排 最主要的韵拿 0 号，
   配色才稳定——按韵组序号配的话改一句字整篇颜色全换。 */
function rhymeSlots(sections) {
  const tally = new Map();
  const rows = [];
  for (const sec of sections) for (const L of sec.lines) {
    const ch = tailChar(L);
    const rs = ch ? reads(ch) : null;
    const y = rs ? rs[0].y : -1;
    rows.push({ ch, y, multi: rs && rs.length > 1 ? rs : null });
    if (y >= 0) tally.set(y, (tally.get(y) || 0) + 1);
  }
  const order = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const slot = new Map(order.map(([y], i) => [y, i]));
  return { rows, slot, order };
}

export { loadRhyme, install, ready, reads, pz, pzAmbig, rhymeName, tailChar, rhymeSlots };
