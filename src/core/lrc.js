import { state } from './state.js';
import { cap, CL, RT } from './clusters.js';

// 一首曲子可以变速多次 所以不能拿单一 BPM 直接乘 要按变速点分段累加
function tempoMap(parsed) {
  const list = [];
  for (const trk of parsed.tracks) for (const e of trk.events)
    if (e.kind === 'meta' && e.metaType === 0x51 && e.data.length === 3)
      list.push({ tick: e.tick, us: (e.data[0] << 16) | (e.data[1] << 8) | e.data[2] });
  list.sort((a, b) => a.tick - b.tick);
  if (!list.length || list[0].tick > 0) list.unshift({ tick: 0, us: 500000 });   // 缺省 120 BPM
  return list;
}

export function tickToSec(parsed) {
  const div = parsed.division;
  // division 最高位为 1 是 SMPTE 帧率 跟 tempo 无关
  if (div & 0x8000) {
    const perSec = (256 - (div >> 8)) * (div & 0xff);
    return tick => perSec ? tick / perSec : 0;
  }
  const ppq = div || 480;
  const map = tempoMap(parsed);
  const at = [0];
  for (let i = 1; i < map.length; i++)
    at.push(at[i - 1] + (map[i].tick - map[i - 1].tick) * map[i - 1].us / ppq / 1e6);
  return tick => {
    let i = map.length - 1;
    while (i > 0 && map[i].tick > tick) i--;
    return at[i] + (tick - map[i].tick) * map[i].us / ppq / 1e6;
  };
}

const stamp = sec => {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + (s - m * 60).toFixed(2).padStart(5, '0');
};

// 格数算法必须跟 flattenChars 一致 否则时间数组的下标对不上格子
function rows() {
  const out = [];
  for (const sec of state.sections) for (const L of sec.lines) {
    const cl = CL(RT(L.t)), C = cap(L);
    out.push({
      cells: C,
      sub: L.g,
      text: Array.from({ length: C }, (_, i) => {
        const c = cl[i];
        return c !== undefined && c !== ' ' && c !== '　' ? c : '';
      }),
    });
  }
  return out;
}

// 句内分句之间留空格 跟导出歌词的 groupOut 一致 否则停顿信息全丢了
function joinSub(text, g) {
  const parts = [];
  let i = 0;
  for (const n of g) { parts.push(text.slice(i, i + n).join('').trim()); i += n; }
  if (i < text.length) parts.push(text.slice(i).join('').trim());
  return parts.filter(x => x).join(' ');
}

// times 是每格一个开始秒数 MIDI 和 .svp 都能算出来 这里不关心来源
export function buildLrc(times, opts = {}) {
  const { offset = 0, word = false } = opts;
  const list = rows();
  const total = list.reduce((a, r) => a + r.cells, 0);
  if (total !== times.length) return { error: 'count', want: total, got: times.length };

  /* 偏移只加进时间戳 不写 [offset:] 头：认那个头的播放器会再偏一次 变成双份，
     而时间戳是所有播放器都认的。 */
  const head = [state.title && '[ti:' + state.title + ']'].filter(Boolean);

  const body = [];
  let i = 0;
  for (const row of list) {
    const at = times.slice(i, i + row.cells);
    i += row.cells;
    if (!row.text.some(c => c)) continue;              // 整行还没填就不写进 LRC
    const t0 = at[0] + offset;
    if (!word) {
      body.push('[' + stamp(t0) + ']' + joinSub(row.text, row.sub));
      continue;
    }
    // 增强型 LRC 每个字前面再带一个 <mm:ss.xx>
    let s = '[' + stamp(t0) + ']';
    const edges = new Set();
    let acc = 0;
    for (const n of row.sub) { acc += n; edges.add(acc); }   // 分句边界的格子下标
    row.text.forEach((c, k) => {
      if (!c) return;
      if (k && edges.has(k)) s += ' ';
      s += '<' + stamp(at[k] + offset) + '>' + c;
    });
    body.push(s);
  }
  return { text: head.concat(body).join('\n') + '\n' };
}
