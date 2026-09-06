import { newLine } from './state.js';
import { inferBreaks, midiNotesToSections } from './midi.js';

/* Synthesizer V 工程（.svp）是 JSON，但文件末尾带一个 \0，
   JSON.parse 会因此报「Unexpected token」。截到第一个完整 JSON 为止。 */
export function parseSvp(text) {
  const end = text.lastIndexOf('}') + 1;
  return JSON.parse(end > 0 ? text.slice(0, end) : text);
}

/* SV 里一个音符一个音节：连音（一个字唱多个音符）用 lyrics "-" 或 "+" 标记，
   要合并进前一个字，否则字数会多算——这正是从 MIDI 推不出来的信息。
   la/a 之类的占位音节算「有格子但没填字」。 */
/* SV 的时间单位是 blick：1 四分音符 = 705600000 blick，跟秒无关，换算必须过 bpm。
   当成纳秒读会把整首拉长 1.6 倍（136bpm 下 3:04 变成 4:54）。 */
const BLICK = 705600000;

/* tempo 点的 position 也是 blick。变速要按段累加，不能只拿第一个 bpm 乘到底。 */
export function svpClock(j) {
  const tempo = (j.time?.tempo || []).slice().sort((a, b) => a.position - b.position);
  if (!tempo.length) tempo.push({ position: 0, bpm: 120 });
  if (tempo[0].position > 0) tempo.unshift({ position: 0, bpm: tempo[0].bpm });
  const map = [];
  let sec = 0;
  for (let i = 0; i < tempo.length; i++) {
    map.push({ at: tempo[i].position, sec, bpm: tempo[i].bpm });
    const next = tempo[i + 1];
    if (next) sec += (next.position - tempo[i].position) / BLICK * 60 / tempo[i].bpm;
  }
  return b => {
    let k = 0;
    while (k + 1 < map.length && map[k + 1].at <= b) k++;
    return map[k].sec + (b - map[k].at) / BLICK * 60 / map[k].bpm;
  };
}

export const svpBpm = j => j.time?.tempo?.[0]?.bpm || 120;

const CONT = new Set(['-', '+']);
const PLACEHOLDER = new Set(['la', 'a', 'ah', 'na', 'oh', 'wu', 'lu', 'da']);

export function svpTracks(j) {
  const toSec = svpClock(j);
  return (j.tracks || []).map((t, i) => {
    const notes = (t.mainGroup?.notes || []).slice().sort((a, b) => a.onset - b.onset);
    // 合并连音：只有起头的音符算一个字
    const chars = [];
    for (const n of notes) {
      const l = String(n.lyrics ?? '').trim();
      if (CONT.has(l) && chars.length) {
        chars[chars.length - 1].end = n.onset + n.duration;
        continue;
      }
      chars.push({
        onset: n.onset,
        end: n.onset + n.duration,
        sec: toSec(n.onset),
        lyric: PLACEHOLDER.has(l.toLowerCase()) ? '' : l,
      });
    }
    const first = chars[0], last = chars[chars.length - 1];
    const pitches = notes.map(n => n.pitch);
    return {
      index: i, name: t.name || '', notes: notes.length, chars,
      // 进入时间和音域帮着分辨主旋律和和声：和声往往从头铺到尾、
      // 或者跟某条主旋律几乎同时进入且音域更窄
      start: first ? first.sec : 0,
      span: first ? toSec(last.end) - first.sec : 0,
      lo: pitches.length ? Math.min(...pitches) : 0,
      hi: pitches.length ? Math.max(...pitches) : 0,
    };
  }).filter(t => t.chars.length);
}

/* 换算成 midi.js 那套 {tick, end} 结构，直接复用休止聚类推断分句。
   blick 换 tick 只是等比缩放，div 取多少都不影响聚类结果。 */
export function svpToSections(track) {
  const div = 480;
  const toTick = b => Math.round(b / BLICK * div);
  const spans = track.chars.map(c => ({ tick: toTick(c.onset), end: toTick(c.end), note: 60 }));
  const secs = midiNotesToSections(inferBreaks(spans, div));
  return secs;
}

/* 一首歌常常由好几条轨交替演唱（主歌一条、副歌一条、和声几条），
   所以整首词格是「把选中的轨切成段落，再按每段的开始时间穿插排序」，
   而不是把某一条轨从头读到尾。段落自带时间，排完顺序就是演唱顺序。 */
export function svpMerge(tracks) {
  const segs = [];
  for (const tr of tracks) {
    let at = 0;
    for (const sec of svpToSections(tr)) {
      const cells = sec.lines.reduce((a, l) => a + l.g.reduce((x, y) => x + y, 0), 0);
      const chars = tr.chars.slice(at, at + cells);
      segs.push({
        start: chars[0] ? chars[0].sec : 0,
        name: tr.name,
        lines: sec.lines,
        // 每格一个开始秒数，导出 LRC 用；顺序跟 lines 摊平后的格子一致
        times: chars.map(c => c.sec),
      });
      at += cells;
    }
  }
  segs.sort((a, b) => a.start - b.start);
  const seen = {};
  const sections = [], times = [];
  for (const s of segs) {
    seen[s.name] = (seen[s.name] || 0) + 1;
    sections.push({ name: s.name + " " + seen[s.name], lines: s.lines });
    times.push(...s.times);
  }
  return { sections, times };
}

