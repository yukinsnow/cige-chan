import { newLine } from './state.js';
import { t } from '../i18n/index.js';

/* ================= MIDI 导入（实验功能） =================
   约定（Studio One 里实测确认过的音符编号）：
     C0  = 24  分句断点（一句里的停顿，对应 L.g 里的一个分组）
     C#0 = 25  换句（一句结束）
     D0  = 26  换段落
   这三个 keyswitch 只是"标记"，不占格子；velocity 不看，事件存在就算数。
   其余任何 note-on（velocity>0）都算一个字/一格。三个标记跟真正唱的音符
   假定在同一条音轨里，靠音高区分，不需要专门找"哪条音轨是人声"。 */
const MIDI_KS = { 24:"sub", 25:"line", 26:"sec" };

/* 完整解析一份 Standard MIDI File，保留"改完再写回去"需要的一切：
   头信息（format/ntrks/division）+ 每条音轨的事件列表（tick 是绝对时值，
   不是相对 delta，方便后面删事件、插事件时不用操心连锁重算）。
   没有 keyswitch 的音轨会整条保留原始字节（raw），改的时候直接照抄，
   保证跟本次改动无关的部分永远跟原文件一模一样。 */
function parseMidiFile(buf){
  const dv = new DataView(buf);
  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const str = n => { let s=""; for(let i=0;i<n;i++) s+=String.fromCharCode(u8()); return s; };
  const vlq = () => { let v=0,b; do{ b=u8(); v=(v<<7)|(b&0x7f); }while(b&0x80); return v>>>0; };
  const bytes = n => { const a = new Uint8Array(buf, p, n); p += n; return Array.from(a); };

  if(buf.byteLength < 14 || str(4) !== "MThd") throw new Error(t("errNotMidi"));
  const hlen = u32();
  const format = u16(), ntrks = u16(), division = u16();
  p += hlen - 6;                   // 头块理论上正好 6 字节，多出来的跳过以防万一

  const tracks = [];
  for(let ti=0; ti<ntrks; ti++){
    const trackStart = p;
    if(str(4) !== "MTrk") throw new Error(t("errNoMTrk", ti+1));
    const tlen = u32();
    const trackEnd = p + tlen;
    const events = [];
    let tick = 0, running = 0;
    while(p < trackEnd){
      tick += vlq();
      let status = u8();
      if(status < 0x80){ p--; status = running; }               // running status：这个字节其实是数据
      else if(status !== 0xFF && status !== 0xF0 && status !== 0xF7) running = status;
      else running = 0;                                          // meta/sysex 之后不能沿用 running status
      // 注意：不能写成 `p += vlq()`——vlq() 内部会通过 u8() 副作用推进 p，
      // 复合赋值的左值却是在算 RHS 之前就取好的旧 p，两个改动会互相打架、
      // 把刚读掉的变长字节又“吐”回去，导致后面全错位。必须分两步。
      if(status === 0xFF){
        const metaType = u8(); const len = vlq(); const data = bytes(len);
        events.push({tick, kind:"meta", metaType, data});
      }else if(status === 0xF0 || status === 0xF7){
        const len = vlq(); const data = bytes(len);
        events.push({tick, kind:"sysex", status, data});
      }else{
        const hi = status & 0xF0;
        const data = bytes((hi===0xC0||hi===0xD0) ? 1 : 2);
        events.push({tick, kind:"channel", status, data});
      }
    }
    const raw = new Uint8Array(buf, trackStart, p - trackStart);   // 这条音轨的原始字节（含 MTrk 头）
    tracks.push({raw, events});
    p = trackEnd;
  }
  return {format, ntrks, division, tracks};
}

/* 把所有音轨的 note-on（velocity>0）事件合并、按 tick 排序，返回
   [{tick, note}, ...]（这里也包含 keyswitch 本身，识别哪个是 keyswitch
   由调用方按音高判断）。 */
function collectNoteOns(parsed){
  const notes = [];
  for(const trk of parsed.tracks) for(const e of trk.events)
    if(e.kind === "channel" && (e.status & 0xF0) === 0x90 && e.data[1] > 0)
      notes.push({tick: e.tick, note: e.data[0]});
  notes.sort((a,b)=>a.tick-b.tick);
  return notes;
}

/* 把按时间排好序的 note 事件切成 段落 → 句 → 分句：
   遇到 D0/C#0/C0 就把"刚刚攒的这几个音符"收成一个分句/句/段落，
   两个 keyswitch 之间一个音符都没有就跳过、不生成空分句/空句/空段落。 */
/* 每个音符实际唱多久：note-on 到配对的 note-off。同一音高可能重复出现，
   按「同音高的下一个 off」配对。缺 off 的（有些文件用 velocity 0 的 on 代替）
   已经在上面按 note-on 收集时排除了，这里再兜一层。 */
function noteSpans(parsed){
  const on = [], span = new Map();
  for(const trk of parsed.tracks) for(const e of trk.events){
    if(e.kind !== "channel") continue;
    const hi = e.status & 0xF0;
    if(hi === 0x90 && e.data[1] > 0) on.push({tick: e.tick, note: e.data[0]});
    else if(hi === 0x80 || (hi === 0x90 && e.data[1] === 0)){
      // 最近一个还没配对的同音高 on
      for(let k = on.length - 1; k >= 0; k--)
        if(on[k].note === e.data[0] && !span.has(on[k])){ span.set(on[k], e.tick); break; }
    }
  }
  on.sort((a, b) => a.tick - b.tick);
  return on.map(n => ({ ...n, end: span.get(n) ?? n.tick }));
}

/* 没有 keyswitch 时按「唱完到下一个字之间的空白」推断分句。

   量的是休止（上一个音符结束 → 下一个开始），不是音符起点间隔——后者包含音符
   自身时长，同句里一个四分音符和一个八分音符后面都紧接着唱，起点间隔差一倍但
   中间都没有空隙，都不该断。

   阈值不能写死，绝对时长和固定拍数都行不通：MIDI 里往往没有 tempo 事件
   （BPM 只写在文件名里），而同样「停一拍」在 70 BPM 和 140 BPM 下差一倍。
   改成看这首歌自己有哪几档休止：把休止按倍差聚类，最短那档是句内气口（分句），
   往上一档是句间（换句），明显更长的是段落间。真实旋律的休止是量化过的，
   档位天然分离，聚类比任何固定阈值都稳。

   这只是启发式：气口在乐句内部、或者两句连唱时会判错，导入后仍要用户核对。 */
/* 把休止聚成几档。真实旋律的休止是量化过的，档位天然分离，
   但同一档的值会因为时间单位换算的舍入差个一两 tick（383 和 384），
   所以先按 1.5 倍容差归并近邻，再按倍差分档。 */
function restTiers(rests){
  const uniq = [...new Set(rests)].sort((a, b) => a - b);
  if(!uniq.length) return [];
  const tiers = [[uniq[0]]];
  for(let i = 1; i < uniq.length; i++){
    const prev = tiers[tiers.length - 1];
    // 比同档最大值大 1.5 倍以上才算新的一档；1.5 而不是 2，是为了让
    // 半拍/一拍这种相邻档位也能分开，同时容忍舍入误差
    if(uniq[i] > prev[prev.length - 1] * 1.5) tiers.push([uniq[i]]);
    else prev.push(uniq[i]);
  }
  return tiers.map(t => t[0]);
}

/* 档数不定（这首歌两档、那首五档），所以不能按序号取层级。

   靠「倍差跳变」找段落线：段落间的空档比换气长一个数量级（间奏 vs 换口气），
   这个跳变一定是所有档位间隙里最大的那个。跳变点及以上算段落分隔。

   跳变点下面还有两档以上时，最长那档算句间；只剩一档时这首歌的句间和句内
   用的是同一种气口（物理上分不出来），那就都算分句，别硬猜。 */
function pickLevels(tiers){
  const n = tiers.length;
  if(n <= 1) return { sub: tiers[0] ?? Infinity, line: Infinity, sec: Infinity };
  let at = 1, best = 0;
  for(let i = 1; i < n; i++){
    const jump = tiers[i] / tiers[i - 1];
    if(jump > best){ best = jump; at = i; }
  }
  // 跳变不到 6 倍就没有段落级的空档，全部按句子处理
  if(best < 6) return { sub: tiers[0], line: tiers[n - 1], sec: Infinity };
  return {
    sub: tiers[0],
    line: at >= 2 ? tiers[at - 1] : Infinity,
    sec: tiers[at],
  };
}

function inferBreaks(spans, division, sens = 1){
  if(spans.length < 3) return spans.map(n => ({ tick: n.tick, note: n.note }));
  const beat = (division & 0x8000) ? ((256 - (division >> 8)) * (division & 0xff)) : (division || 480);
  // 小于 1/8 拍的空隙是量化误差或断奏，不是气口
  const floor = beat / 8;
  const rests = [];
  for(let i = 0; i < spans.length - 1; i++){
    const r = spans[i + 1].tick - spans[i].end;
    if(r >= floor) rests.push(r);
  }
  const T = pickLevels(restTiers(rests));
  const out = [];
  for(let i = 0; i < spans.length; i++){
    const n = spans[i];
    out.push({ tick: n.tick, note: n.note });
    const next = spans[i + 1];
    if(!next) continue;
    const rest = next.tick - n.end;
    if(rest < floor) continue;
    const kind = rest >= T.sec ? 26 : rest >= T.line ? 25 : 24;
    out.push({ tick: n.end + 1, note: kind, inferred: true });
  }
  return out;
}

function midiNotesToSections(notes){
  const sections = [];
  let curSec = null, curG = [], count = 0, secN = 0;
  const ensureSec = () => { if(!curSec){ secN++; curSec = {name:t("autoSectionName", secN), lines:[]}; } };
  const endGroup = () => { if(count > 0){ curG.push(count); count = 0; } };
  const endLine = () => { endGroup(); if(curG.length){ ensureSec(); curSec.lines.push(newLine(curG)); } curG = []; };
  const endSection = () => { endLine(); if(curSec && curSec.lines.length) sections.push(curSec); curSec = null; };

  for(const {note} of notes){
    const ks = MIDI_KS[note];
    if(ks === "sec") endSection();
    else if(ks === "line") endLine();
    else if(ks === "sub") endGroup();
    else count++;
  }
  endSection();   // 文件末尾兜底：最后一段没有 D0 收尾也要算数
  return sections;
}

function vlqEncode(v){
  const b = [v & 0x7f]; v = v >>> 7;
  while(v > 0){ b.unshift((v & 0x7f) | 0x80); v = v >>> 7; }
  return b;
}

/* 哪几条音轨含 keyswitch（正常应该只有一条，人声和 keyswitch 混在一起）。 */
function keyswitchTrackIndices(parsed){
  const idx = [];
  parsed.tracks.forEach((trk,i)=>{
    if(trk.events.some(e => e.kind==="channel" && (e.status&0xF0)===0x90 && e.data[1]>0 && MIDI_KS[e.data[0]] !== undefined)) idx.push(i);
  });
  return idx;
}

/* 去掉一条音轨事件列表里 keyswitch 的 note-on/note-off 配对，其余原样保留。 */
function stripKeyswitch(events){
  const out = [], held = new Set();
  for(const e of events){
    if(e.kind === "channel"){
      const hi = e.status & 0xF0, note = e.data[0];
      if(hi === 0x90 && e.data[1] > 0 && MIDI_KS[note] !== undefined){ held.add(note); continue; }
      if(held.has(note) && (hi === 0x80 || (hi === 0x90 && e.data[1] === 0))){ held.delete(note); continue; }
    }
    out.push(e);
  }
  return out;
}

/* 把一条音轨的事件列表重新序列化成 MTrk 字节块。永远写完整的 status byte、
   不用 running status——这只是个可选的省字节技巧，写不写都是合法文件，
   不写更简单也更不容易出错。events 必须已经按 tick 排好序，且已经包含
   原有的 End of Track（0xFF 0x2F）事件，不用另外补一个。 */
function serializeTrack(events){
  const body = [];
  let prevTick = 0;
  for(const e of events){
    body.push(...vlqEncode(e.tick - prevTick));
    prevTick = e.tick;
    if(e.kind === "meta") body.push(0xFF, e.metaType, ...vlqEncode(e.data.length), ...e.data);
    else if(e.kind === "sysex") body.push(e.status, ...vlqEncode(e.data.length), ...e.data);
    else body.push(e.status, ...e.data);
  }
  const head = [0x4D,0x54,0x72,0x6B, (body.length>>>24)&0xff,(body.length>>>16)&0xff,(body.length>>>8)&0xff,body.length&0xff];
  return new Uint8Array([...head, ...body]);
}

function serializeMidiFile(parsed, trackBytesList){
  const head = [
    0x4D,0x54,0x68,0x64, 0,0,0,6,
    (parsed.format>>>8)&0xff, parsed.format&0xff,
    (parsed.ntrks>>>8)&0xff, parsed.ntrks&0xff,
    (parsed.division>>>8)&0xff, parsed.division&0xff,
  ];
  let total = head.length;
  for(const t of trackBytesList) total += t.length;
  const out = new Uint8Array(total);
  out.set(head, 0);
  let off = head.length;
  for(const t of trackBytesList){ out.set(t, off); off += t.length; }
  return out;
}

/* 纯净导出：把含 keyswitch 的音轨重新序列化去掉 keyswitch，其余音轨原始
   字节直接照抄。返回 null 表示这次会话里还没导入过 MIDI。 */

export { MIDI_KS, parseMidiFile, collectNoteOns, noteSpans, midiNotesToSections, inferBreaks,
         vlqEncode, keyswitchTrackIndices, stripKeyswitch,
         serializeTrack, serializeMidiFile };
