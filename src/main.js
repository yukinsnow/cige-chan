import './style.css';
import { createApp, watchEffect } from 'vue';
import App from './App.vue';
import { $, el } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { closeDialog } from './ui/dialogs.js';
import { closeAllMenus } from './ui/menu.js';
import { TAURI, download, downloadBinary } from './platform/save.js';
import { isDesktopApp, isMac } from './platform/env.js';
import { initTips } from './ui/tip.js';
import { openCtx, closeCtx } from './ui/ctxmenu.js';
import { maybeStartTour } from './ui/tour.js';
import { initSliders } from './ui/slider.js';
import { bindExternalLinks } from './platform/link.js';
import { applyAccent, applyBg, loadBgImage } from './core/theme.js';
import { pick } from './platform/open.js';
import { aiClosePanel } from './ai.js';
import { save, load } from './core/persist.js';
import { cap, RT, CL } from './core/clusters.js';
import { SAMPLE, state, ui, newLine, norm, normAll, redraw } from './core/state.js';
import { I18N, t, LOCALE, loadLocales } from './i18n/index.js';
import { parseTxt, patTxt } from './core/txt.js';
import { MIDI_KS, parseMidiFile, collectNoteOns, midiNotesToSections, keyswitchTrackIndices, stripKeyswitch, serializeTrack, serializeMidiFile } from './core/midi.js';

/* ================= 以下为原 src/ai.js，逐字搬入 ================= */

/* ================= persistence ================= */
/* ================= import / export ================= */
function applyTxt(text){
  const { title, secs } = parseTxt(text);
  if(!secs.length){ toast(t("toastNoParse")); return; }
  if(title) state.title = title;
  state.sections = secs; normAll(); redraw();
  toast(t("toastImported", secs.length, secs.reduce((a,s)=>a+s.lines.length,0)));
}
/* 当前导入的 MIDI 原始结构，供后面「导出」用；只放在内存里，不进 state、
   不进工程文件、也不写 localStorage——刷新页面或者切换工程就没了，
   到时候需要导出的话重新导入一次 MIDI 即可。 */
let midiImport = null;

function applyMidi(buf){
  let parsed, notes, secs;
  try{
    parsed = parseMidiFile(buf);
    notes = collectNoteOns(parsed);
    secs = midiNotesToSections(notes);
  }catch(e){ toast(t("toastMidiParseFail", e.message)); return; }
  if(!secs.length){ toast(t("toastMidiNoStructure")); return; }
  /* 整份文件一个 keyswitch 都没有：所有音符会挤成一句，导进来还得自己一句句
     切开。先把话说清楚再让人决定，免得白导一次、还把当前内容顶掉。 */
  if(!notes.some(n => MIDI_KS[n.note]) && !confirm(t("confirmMidiNoKs", notes.length))) return;
  midiImport = {parsed, notes};
  state.sections = secs; normAll(); redraw();
  toast(t("toastMidiImported", secs.length, secs.reduce((a,s)=>a+s.lines.length,0)));
}

/* ---- MIDI 导出：纯净版 / 带歌词版 ---- */

/* 变长时值编码（vlq 解码的反过程） */
function buildCleanMidi(){
  if(!midiImport) return null;
  const { parsed } = midiImport;
  const ks = new Set(keyswitchTrackIndices(parsed));
  const trackBytesList = parsed.tracks.map((trk,i)=> ks.has(i) ? serializeTrack(stripKeyswitch(trk.events)) : trk.raw);
  return serializeMidiFile(parsed, trackBytesList);
}

/* 逐句 / 逐分句比对当前词格和这次导入的 MIDI 是否还对得上（万一导入之后
   手动加减过格子/句/段，就会跟 MIDI 对不上，带歌词导出必须先拦住这种
   情况，不然歌词会对错位）。完全一致返回 null，否则返回哪里不对的说明。 */
function midiMismatch(){
  if(!midiImport) return t("toastNoMidiForCheck");
  const a = state.sections, b = midiNotesToSections(midiImport.notes);
  if(a.length !== b.length) return t("toastSecCountMismatch", a.length, b.length);
  for(let si=0; si<a.length; si++){
    const la = a[si].lines, lb = b[si].lines;
    if(la.length !== lb.length) return t("toastLineCountMismatch", si+1, a[si].name, la.length, lb.length);
    for(let li=0; li<la.length; li++){
      const ga = la[li].g, gb = lb[li].g;
      if(ga.length !== gb.length || ga.some((n,i)=>n !== gb[i]))
        return t("toastPatternMismatch", si+1, a[si].name, li+1, ga.join("/"), gb.join("/"));
    }
  }
  return null;
}

/* 按 段落→句→格子 的顺序摊平成一串字符（拗音按 CL 算一格，跟格子计数
   规则完全一致），用来跟 MIDI 里"演唱音符"的先后顺序一一对应。 */
function flattenChars(){
  const out = [];
  for(const sec of state.sections) for(const L of sec.lines){
    const cl = CL(RT(L.t)), C = cap(L);
    for(let i=0;i<C;i++){ const c = cl[i]; out.push(c !== undefined && c !== " " && c !== "　" ? c : ""); }
  }
  return out;
}

/* 带歌词导出：先做逐句校验，通不过就直接报错、不生成文件。通过之后，
   在去掉 keyswitch 的同时，往每个"演唱音符"的同一个 tick 上插一个
   Lyric meta event（0xFF 0x05，UTF-8 文本），跟导入时的顺序完全对应。 */
function buildLyricMidi(){
  const mismatch = midiMismatch();
  if(mismatch) return { error: mismatch };
  const { parsed, notes } = midiImport;
  const chars = flattenChars();
  const sungCount = notes.filter(n => MIDI_KS[n.note] === undefined).length;
  if(chars.length !== sungCount) return { error: t("toastInternalCountMismatch") };

  const ks = new Set(keyswitchTrackIndices(parsed));
  const enc = new TextEncoder();
  const trackBytesList = parsed.tracks.map((trk,i)=>{
    if(!ks.has(i)) return trk.raw;
    const cleaned = stripKeyswitch(trk.events);
    const withLyrics = [];
    let ci = 0;
    for(const e of cleaned){
      if(e.kind === "channel" && (e.status & 0xF0) === 0x90 && e.data[1] > 0){
        withLyrics.push({tick: e.tick, kind:"meta", metaType:0x05, data: Array.from(enc.encode(chars[ci++] || ""))});
      }
      withLyrics.push(e);
    }
    withLyrics.sort((x,y)=>x.tick-y.tick);   // 稳定排序：同一 tick 上歌词事件仍排在它对应的 note-on 前面
    return serializeTrack(withLyrics);
  });
  return { bytes: serializeMidiFile(parsed, trackBytesList) };
}

function applyJson(text){
  try{ const o = JSON.parse(text);
    if(!o.sections || !Array.isArray(o.sections)) throw 0;
    state.title = o.title || t("untitled"); state.sections = o.sections;
    if(o.exp) state.exp = {alts:!!o.exp.alts, note:!!o.exp.note};
    normAll();
    redraw(); toast(t("toastProjectOpened"));
  }catch(e){ toast(t("toastInvalidProject")); }
}
/* 按文件名或内容自动判断是工程还是词格 */
function applyText(name, text){
  if(/\.json$/i.test(name || "") || /^\s*\{/.test(text)) applyJson(text); else applyTxt(text);
}
function readFile(f){
  if(/^image\//.test(f.type || "") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name)){ loadBgImage(f); return; }
  const r = new FileReader();
  r.onload = ()=>applyText(f.name, String(r.result));
  r.readAsText(f,"utf-8");
}


/* 打开文件：桌面版走系统原生对话框，浏览器里退回 <input type=file> */
async function openText(kind){
  if(TAURI){
    try{
      const r = await TAURI.core.invoke("open_text", kind === "json"
        ? {filterName:t("dlgFilterProject"), exts:["json"]}
        : {filterName:t("dlgFilterLyricsPattern"), exts:["txt","md"]});
      if(r) applyText(r.name, r.contents);
    }catch(e){ toast(t("toastOpenFail", e)); }
    return;
  }
  pick(kind === "json" ? ".json" : ".txt,.md");
}
/* MIDI 是二进制，跟文本导入分开走一套：桌面版调新的 open_binary 命令，
   浏览器版用另一个隐藏的 <input type=file>（accept 已经锁定 .mid/.midi，
   不需要像文本那样跑时再切换 accept）。 */
async function openMidi(){
  if(TAURI){
    try{
      const bytes = await TAURI.core.invoke("open_binary", {filterName:t("dlgFilterMidi"), exts:["mid","midi"]});
      if(bytes) applyMidi(new Uint8Array(bytes).buffer);
    }catch(e){ toast(t("toastOpenFail", e)); }
    return;
  }
  const f = $("#filemidi"); f.value = ""; f.click();
}
$("#file").onchange = e=>{ const f = e.target.files[0]; if(f) readFile(f); };
$("#filemidi").onchange = e=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onerror = ()=>toast(t("toastFileUnreadable"));
  r.onload = ()=>applyMidi(r.result);
  r.readAsArrayBuffer(f);
};
const expPat = ()=>download(state.title+t("fnPattern"), patTxt());
function expProj(){
  const o = Object.assign({}, state); delete o.bg;   // 背景是本机偏好，不写进工程
  download(state.title+t("fnProjectExt"), JSON.stringify(o,null,2));
};
function expMidiClean(){
  const bytes = buildCleanMidi();
  if(!bytes){ toast(t("toastNoMidiSession")); return; }
  downloadBinary(state.title + t("fnMidiClean"), bytes);
};
function expMidiLyr(){
  const r = buildLyricMidi();
  if(r.error){ toast(r.error); return; }
  downloadBinary(state.title + t("fnMidiLyric"), r.bytes);
}

/* ---- 导出歌词：勾选对话框 ---- */
/* ================= toolbar ================= */
function setCell(v){ state.cell = Math.max(28,Math.min(72,v)); document.documentElement.style.setProperty("--cell",state.cell+"px"); save(); }
/* ================= 背景 =================
   背景是个人偏好，只存在这台电脑上：
   设置项跟着 state 走，图片本身单独存一个 localStorage 键。
   分开存是为了万一图片撑爆配额，歌词的自动保存不会跟着一起失败。 */
function newProject(){ if(!confirm(t("confirmNew"))) return;
  state.title = t("untitled"); state.sections = JSON.parse(JSON.stringify(SAMPLE)); normAll(); redraw(); }
addEventListener("keydown",e=>{ if(e.key === "Escape"){ closeDialog(); aiClosePanel(); closeAllMenus(); } });
function reflow(){
  let moved = 0;
  for(const sec of state.sections){
    for(let i=0;i<sec.lines.length;i++){
      const L = sec.lines[i], C = cap(L), chars = [...RT(L.t)];
      if(chars.length > C){
        const over = chars.slice(C).join(""); L.t = RT(chars.slice(0,C).join("")); moved += over.length;
        if(i+1 < sec.lines.length) sec.lines[i+1].t = over + sec.lines[i+1].t.replace(/^ +/,"");
        else { const nl = newLine([over.length]); nl.t = over; sec.lines.push(nl); }
      }
    }
  }
  redraw(); toast(moved ? t("toastReflowed", moved) : t("toastNoOverflow"));
}

/* drag & drop */
// 拖放只在有指针的设备上装：触屏没有「拖文件进来」这回事，
// 装上只会因为长按拖动误触发，把随手拖到的图片设成背景。
if(matchMedia("(pointer:fine)").matches){
  let dc = 0;
  addEventListener("dragenter",e=>{ e.preventDefault(); if(++dc) ui.dragging = true; });
  addEventListener("dragover",e=>e.preventDefault());
  addEventListener("dragleave",()=>{ if(--dc <= 0){ dc = 0; ui.dragging = false; } });
  addEventListener("drop",e=>{ e.preventDefault(); dc = 0; ui.dragging = false;
    const f = e.dataTransfer.files[0]; if(f) readFile(f); });
}

/* ================= 头部下拉菜单（导入/导出/语言） =================
   触发按钮点一下切换显示，点菜单里任意按钮或点菜单外任何地方都收起来，
   Escape 也收起（跟已有的 help/exp/settings 弹窗共用下面那个 Escape 监听）。 */
/* ================= 语言切换 ================= */
/* ================= boot ================= */
// 挂载必须在 await 之后 否则首帧没有文案
// 桌面端用自绘右键菜单代替 webview 那个：原生菜单的外观由系统定，
// 在无边框窗口里格外突兀。浏览器版不动它，那里用户预期就是原生菜单。
if(TAURI){
  addEventListener("contextmenu", e => { e.preventDefault(); openCtx(e); });
  addEventListener("keydown", e => { if(e.key === "Escape") closeCtx(); });
  addEventListener("blur", closeCtx);
}

// 桌面客户端才有窗口按钮 顶栏要给它预留内边距
if(isDesktopApp){
  document.documentElement.classList.add("wctl-on");
  if(isMac) document.documentElement.classList.add("is-mac");
}
addEventListener("blur", ()=>document.documentElement.classList.add("unfocused"));
addEventListener("focus", ()=>document.documentElement.classList.remove("unfocused"));

// 界面文字可以手动划选复制 但 Ctrl+A 不该全选整个界面 只在输入框里放行
addEventListener("keydown", e => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a"){
    const el = document.activeElement;
    if(!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) e.preventDefault();
  }
});

initTips();
bindExternalLinks();

async function boot(){
  await loadLocales();
  load();
  if(!state.exp) state.exp = {alts:false, note:false};
  normAll();
  if(state.theme === "paper") state.theme = "light";   // 2.x 存下来的旧值
  if(!["system","light","dark"].includes(state.theme)) state.theme = "system";
  if(!state.bg) state.bg = {mode:"none", color:"#1a1614", dim:.55, blur:0};
  if(state.bg.mode === "image" && !ui.bgImg) state.bg.mode = "none";   // 图片没存住就退回默认
  if(!I18N[state.lang]) state.lang = "zh";
  // 词格很长的一句在手机窄屏上，默认 44px 一格很容易比屏幕还宽，把整个页面撑出横向滚动。
  // 没动过字号（还是出厂默认 44）又赶上窄屏，就先给个更适配的默认值；已经自己调过大小的
  // 不去动它——A−/A+ 存下来的选择要一直尊重。
  if(state.cell === 44 && innerWidth < 480) state.cell = 32;
  if(!state.accent || !["auto","blue","green","violet","rose","cyan","orange","slate","red"].includes(state.accent)) state.accent = "auto";
  applyBg();
  applyAccent();
  // document 的 lang 和标题跟着 state 走
  watchEffect(()=>{
    document.documentElement.lang = LOCALE[state.lang] || "zh-CN";
    document.title = state.title + " · " + t("brand");
  });

  createApp(App, {
    onNew: newProject, onOpenProj: ()=>openText("json"), onSaveProj: expProj,
    onImpTxt: ()=>openText("txt"), onImpMidi: openMidi,
    onExpPat: expPat, onExpMidiClean: expMidiClean, onExpMidiLyr: expMidiLyr,
    onReflow: reflow,
  }).mount('#app');
  setCell(state.cell);
  initSliders();
  maybeStartTour();
}
boot().catch(e => {
  // 文案取不回来整个界面就是空的 至少说清是怎么回事
  document.getElementById("app").innerHTML =
    '<p style="padding:40px;line-height:1.8">词格酱启动失败：读不到 i18n 文案。<br>'
    + '请确认 i18n/ 目录跟 index.html 放在一起。<br><code>' + e.message + '</code></p>';
  throw e;
});
