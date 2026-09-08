<script setup>
import { onMounted, watch } from 'vue';
import { state, ui, newLine, norm, normAll, breakLine } from '../core/state.js';
import { cap, RT, CL, charToCell, cellToChar } from '../core/clusters.js';
import { parseGroups } from '../core/txt.js';
import { ready as aidReady, pz, pzAmbig, rhymeName, tailChar, rhymeSlots } from '../core/rhyme.js';
import { t } from '../i18n/index.js';
import { save } from '../core/persist.js';
import { $, el } from '../ui/dom.js';
import { toast } from '../ui/toast.js';
import { ask } from '../ui/confirm.js';
import { askBreak } from '../ui/brk.js';
import { iconEl } from '../ui/icon.js';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Copy, X, Minus, Plus, Split,
         SeparatorHorizontal } from 'lucide';

let focusRef = null;      // {si,li,pos}
let composing = false;

const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ================= render ================= */
function render(){
  const doc = $("#doc"); doc.innerHTML = "";
  state.sections.forEach((sec,si)=>{
    const S = el("div","sec"); S.dataset.si = si;

    const head = el("div","sechead");
    const nm = el("input","secname"); nm.value = sec.name; nm.spellcheck = false;
    nm.oninput = ()=>{ sec.name = nm.value; save(); };
    head.appendChild(nm);
    const meta = el("span","secmeta");
    meta.textContent = t("secMeta", sec.lines.length, sec.lines.reduce((a,l)=>a+cap(l),0));
    head.appendChild(meta);
    const st = el("div","sectools");
    st.appendChild(btn(ArrowUp,t("secUp"),()=>moveSec(si,-1)));
    st.appendChild(btn(ArrowDown,t("secDown"),()=>moveSec(si,1)));
    st.appendChild(btn(Copy,t("secDup"),()=>{ state.sections.splice(si+1,0,JSON.parse(JSON.stringify(sec))); render(); }));
    st.appendChild(btn(t("secAdd"),t("secAddTitle"),()=>{ state.sections.splice(si+1,0,{name:t("newSectionName"),lines:[newLine()]}); render(); }));
    st.appendChild(btn(X,t("secDel"),async ()=>{ if(await ask(t("confirmDeleteSec",sec.name))){ state.sections.splice(si,1); render(); } }));
    head.appendChild(st);
    S.appendChild(head);

    sec.lines.forEach((L,li)=> S.appendChild(rowEl(sec,si,L,li)));

    const add = el("button","addline"); add.textContent = t("addLine");
    add.onclick = ()=>{ const last = sec.lines[sec.lines.length-1];
      sec.lines.push(newLine(last ? last.g : [7]));
      focusRef = {si, li:sec.lines.length-1, pos:0}; render(); };
    S.appendChild(add);
    doc.appendChild(S);
  });

  const addSec = el("button","addline"); addSec.textContent = t("addSection"); addSec.style.marginLeft = "0";
  addSec.onclick = ()=>{ state.sections.push({name:t("newSectionName"),lines:[newLine()]}); render(); };
  doc.appendChild(addSec);

  restoreFocus(); save();
}

function btn(icon,title,fn){
  const b = el("button"); b.dataset.tip = title; b.onclick = fn;
  if(typeof icon === "string") b.textContent = icon; else b.appendChild(iconEl(icon));
  return b;
}

function rowEl(sec,si,L,li){
  const R = el("div","row"); R.dataset.si = si; R.dataset.li = li;

  const ln = el("div","ln"); ln.textContent = li+1; R.appendChild(ln);

  const pat = el("button","pat"); pat.textContent = L.g.join("/"); pat.dataset.tip = t("patTitle");
  pat.onclick = ()=>editPattern(pat,L); R.appendChild(pat);

  const wrap = el("div","wrap");
  const grid = el("div","grid");
  let idx = 0;
  L.g.forEach(n=>{
    const G = el("div","grp");
    for(let k=0;k<n;k++){ const c = el("i","cell"); c.dataset.i = idx++; G.appendChild(c); }
    grid.appendChild(G);
  });
  const ovf = el("span","ovf"); ovf.style.display = "none"; grid.appendChild(ovf);
  wrap.appendChild(grid);

  let curPos = 0;   // 本句光标所在格序号（失焦后仍保留，供工具按钮使用）
  const io = el("input","io"); io.type = "text"; io.autocomplete = "off"; io.spellcheck = false; io.value = L.t;
  const comp = el("span","comp");
  wrap.appendChild(io); wrap.appendChild(comp);
  R.appendChild(wrap);

  const cnt = el("div","cnt"); R.appendChild(cnt);
  const rh = el("div","rh"); R.appendChild(rh);

  const tools = el("div","tools");
  tools.appendChild(btn(Minus,t("rowMinusTitle"),()=>{ chg(L,-1,curPos); redrawRow(si,li,curPos); }));
  tools.appendChild(btn(Plus,t("rowPlusTitle"),()=>{ chg(L,1,curPos); redrawRow(si,li,curPos); }));
  tools.appendChild(btn(Split,t("rowSplitTitle"),()=>{ const m = splitAt(L,curPos); redrawRow(si,li,curPos); if(m) toast(m); }));
  tools.appendChild(btn(SeparatorHorizontal,t("rowBreakTitle"),()=>openBreak(sec,si,L,li)));
  // 整句左右挪一格，跟 Alt+←/→ 同一个操作——手机上没有 Alt 键，只能靠这两个按钮
  tools.appendChild(btn(ArrowLeft,t("rowShiftLeftTitle"),()=>{
    const blocked = shiftLine(L,-1); if(blocked){ toast(blocked); return; }
    redrawRow(si,li,Math.max(0,curPos-1)); }));
  tools.appendChild(btn(ArrowRight,t("rowShiftRightTitle"),()=>{
    const blocked = shiftLine(L,1); if(blocked){ toast(blocked); return; }
    redrawRow(si,li,Math.min(curPos+1,cap(L))); }));
  tools.appendChild(btn(Copy,t("rowDupTitle"),()=>{ sec.lines.splice(li+1,0,newLine(L.g)); focusRef={si,li:li+1,pos:0}; render(); }));
  tools.appendChild(btn(X,t("rowDelTitle"),()=>{ sec.lines.splice(li,1); if(!sec.lines.length) sec.lines.push(newLine()); focusRef={si,li:Math.max(0,li-1),pos:0}; render(); }));
  R.appendChild(tools);

  /* ---- 备选版本 + 备注 ---- */
  norm(L);
  R.classList.toggle("hasx", !!(L.alts.length || L.note));
  const ex = el("div","extra");
  const vlab = el("span","vlab"); vlab.textContent = t("versionLabel"); ex.appendChild(vlab);
  const vw = el("span","vwrap"); ex.appendChild(vw);

  /* L.alts 是这句存下来的版本清单；L.t 是此刻正在编辑的文字。
     L.t 不在清单里就说明是还没存的新写法，单独用一个「未存」方块表示。
     文字一变版本条就要跟着变，所以单独抽成函数，输入时也调用。 */
  const short = s => [...s].slice(0,7).join("") + ([...s].length > 7 ? "…" : "");
  function buildVers(){
    vw.innerHTML = "";
    const cur = RT(L.t);
    const unsaved = !!cur && !L.alts.includes(cur);

    if(unsaved){
      const c = el("button","vc on"); c.textContent = t("unsavedPrefix") + short(cur);
      c.dataset.tip = t("unsavedTitle", cur);
      vw.appendChild(c);
    }

    L.alts.forEach((txt,i)=>{
      const on = txt === cur;
      const c = el("button","vc" + (on ? " on" : ""));
      c.textContent = (i+1) + " · " + (short(txt) || t("versionEmpty"));
      c.dataset.tip = (on ? t("versionCurrentTitle") : t("versionSwitchTitle")) + txt;
      if(!on) c.onclick = ()=>{
        if(cur && !L.alts.includes(cur)) L.alts.push(cur);   // 先把未存的写法保住，绝不丢稿
        L.t = txt; redrawRow(si,li,0); toast(t("toastSwitchedVersion", i+1));
      };
      const x = el("span","vx"); x.textContent = "×"; x.dataset.tip = t("versionDeleteTitle");
      x.onclick = e=>{ e.stopPropagation(); L.alts.splice(i,1); redrawRow(si,li,curPos); };
      c.appendChild(x);
      vw.appendChild(c);
    });

    if(unsaved){
      const vadd = btn(t("addAlt"),t("addAltTitle"),()=>{
        L.alts.push(cur); redrawRow(si,li,curPos); toast(t("toastSavedVersion", L.alts.length));
      });
      vadd.className = "vadd"; vw.appendChild(vadd);
    }
    R.classList.toggle("hasx", !!(L.alts.length || L.note));
  }
  buildVers();
  R._vers = buildVers;

  const nt = el("input","note"); nt.type = "text"; nt.spellcheck = false;
  nt.value = L.note; nt.placeholder = t("notePlaceholder");
  nt.oninput = ()=>{ L.note = nt.value; R.classList.toggle("hasx", !!(L.alts.length || L.note)); save(); };
  // 备注框放在版本条后面，这样重建版本条不会打断正在输入的备注
  nt.onkeydown = e=>{ if(e.key === "Enter" || e.key === "Escape"){ e.preventDefault(); io.focus(); } };
  ex.appendChild(nt);
  R.appendChild(ex);

  /* ---- events ---- */
  io.addEventListener("compositionstart",()=>{ composing = true; });
  io.addEventListener("compositionupdate",e=>{ showComp(R,comp,io,e.data); });
  io.addEventListener("compositionend",()=>{ composing = false; comp.style.display="none"; onInput(); });
  io.addEventListener("input",()=>{ if(composing){ return; } onInput(); });

  function onInput(){
    const pos0 = io.selectionStart;
    // 全角空格、制表符统一成半角空格；空格保留，代表「这个格子先空着」
    let clean = io.value.replace(/[\t\n\r　]/g," ");

    /* 格子是钉死的：一句里每个字待在自己那一格，不会因为别处的增删整体挪位。
       原生输入框默认是插入/删除后面跟着流动，这里按"这次输入多出或少了几格"
       把它掰回来，光标位置就是发生变化的那一格：
         多出 n 格（打字、粘贴）→ 吃掉光标后面的 n 格，即覆盖，
                                  否则先写好的句尾会被一路推出词格截断丢掉；
         少了 n 格（退格、删除）→ 在光标处补 n 个占位空格，
                                  否则后面写好的字会整体往前挪，跟旋律错开。
       按格子（CL）数算而不是字符数——拗音跟前一个假名并成一格，格数没变就不动。
       占位空格不计入字数，句尾多余的空格在失焦和导出时会自动去掉。 */
    let cl = CL(clean);
    const added = cl.length - CL(L.t).length;
    if(added !== 0){
      const pc = charToCell(cl, Math.min(pos0, clean.length));
      if(added > 0) cl.splice(pc, added);
      else cl.splice(pc, 0, ...Array(-added).fill(" "));
      clean = cl.join("");
    }

    // 词格是几格就最多容纳几格，多打/多粘贴的字直接截掉，不再允许溢出；
    // 想装下更多字，请先用 ＋ 或改词格数字把格子加够。注意这里按格子（CL）数，
    // 不是按字符数——拗音跟前一个假名拼成一格，不占单独的名额。
    const C = cap(L);
    cl = CL(clean);
    if(cl.length > C){ clean = cl.slice(0,C).join(""); toast(t("toastAtCap")); }
    if(clean !== io.value){
      io.value = clean;
      const p = Math.min(pos0, clean.length);
      try{ io.setSelectionRange(p,p); }catch(e){}
    }
    L.t = clean;
    paint(R,L); buildVers(); mark(io.selectionStart); save();
  }
  // p 是原生输入框的字符下标；mark 把它换算成格子下标再记下来、画光标，
  // 这样 curPos/focusRef.pos 在跨行导航和 ＋－ 工具按钮里统一按"第几格"算。
  function mark(p){ const cellPos = charToCell(CL(io.value), p); curPos = cellPos; focusRef = {si,li,pos:cellPos}; caret(R,L,cellPos); paintSel(R); }
  R._mark = mark;   // 供 redrawRow / restoreFocus 在重建行后同步光标位置

  io.addEventListener("focus",()=>{ R.classList.add("active"); mark(io.selectionStart); });
  io.addEventListener("blur",()=>{
    if(RT(L.t) !== L.t){ L.t = RT(L.t); io.value = L.t; paint(R,L); buildVers(); save(); }
    R.classList.remove("active"); R.querySelectorAll(".cell").forEach(c=>c.classList.remove("caret","end","sel")); R.querySelectorAll(".grp").forEach(g=>g.classList.remove("cur")); });
  io.addEventListener("keyup",()=>mark(io.selectionStart));
  // 拖选、全选(Ctrl/⌘+A)、Shift+方向键、长按都会触发 select，这里把选区实时重画到格子上，
  // 划到哪高亮到哪，和平常选文本一致。
  io.addEventListener("select",()=>paintSel(R));
  io.addEventListener("click",e=>{
    // 拖动鼠标选出了一段范围（selectionStart≠End）时，别把它当普通点击去收拢光标——
    // 保留这段选区（和平常选择一致），光标画在拖动的那一端；只有真正的单击才定位光标。
    if(io.selectionStart !== io.selectionEnd){
      mark(io.selectionDirection === "backward" ? io.selectionStart : io.selectionEnd); return;
    }
    // 点/触摸格子内任意位置都定位到这一格本身（不再按左右半格判断"上一格/下一格"，
    // 半格判断在鼠标下没问题，但在触摸屏上误差大，容易点右半边却跳到下一格）。
    // 词格很长时会自动换行成好几排，这里必须先按纵向（行）匹配，行内再比横向距离，
    // 否则手机上点第二排的格子，很容易被判定成第一排里横坐标凑巧接近的格子——
    // 表现出来就是"点了没反应"或者"点哪个格子都定位到别的格子"。
    const cells = [...R.querySelectorAll(".cell")];
    if(!cells.length){ setTimeout(()=>{ seek(0); },0); return; }
    let best = 0, bd = Infinity, bestRect = null;
    cells.forEach((c,i)=>{
      const r = c.getBoundingClientRect();
      const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
      const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
      const d = dy*1000 + dx;   // 纵向权重拉满：先锁定是哪一行，行内再比水平距离
      if(d < bd){ bd = d; best = i; bestRect = r; }
    });
    // 点在最后一格右边界之外（整句末尾的空白处）不触发定位，交互上更符合预期：
    // 词格填满了就是填满了，末尾空白不该还能把光标甩过去。
    if(best === cells.length-1 && e.clientX > bestRect.right) return;
    setTimeout(()=>{ seek(best); },0);
  });

  /* 把光标放到第 p 格（格子下标，不是字符下标）。若这句还没写到那儿，
     先用空格把前面的格子占住，否则浏览器会把光标钳回最后一个字之后——
     那样看到的光标位置就是假的。 */
  function seek(p){
    p = Math.max(0, Math.min(p, cap(L)));
    let clusters = CL(io.value);
    if(p > clusters.length){
      io.value = io.value + " ".repeat(p - clusters.length);
      L.t = io.value; paint(R,L); buildVers(); save();
      clusters = CL(io.value);
    }
    const charPos = cellToChar(clusters, p);
    io.setSelectionRange(charPos,charPos);
    mark(io.selectionStart);   // 以真实光标为准，绝不画一个骗人的光标
  }
  R._seek = seek;

  io.addEventListener("keydown",e=>{
    const mod = e.metaKey || e.ctrlKey;
    const p = charToCell(CL(io.value), io.selectionStart);   // 当前光标所在格子下标
    if(mod && e.key === "]"){ e.preventDefault(); chg(L,1,p);  redrawRow(si,li,p); return; }
    if(mod && e.key === "["){ e.preventDefault(); chg(L,-1,p); redrawRow(si,li,p); return; }
    if(mod && e.key === "\\"){ e.preventDefault(); const m = splitAt(L,p); redrawRow(si,li,p); if(m) toast(m); return; }
    if(e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")){
      // Alt+←/→ 整句左右挪一格，跟 Alt+↑/↓ 整句上下挪是一对
      e.preventDefault();
      const d = e.key === "ArrowLeft" ? -1 : 1;
      const blocked = shiftLine(L,d);
      if(blocked){ toast(blocked); return; }
      redrawRow(si,li,Math.max(0,Math.min(p+d,cap(L)))); return;
    }
    if(e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")){
      e.preventDefault(); const d = e.key === "ArrowUp" ? -1 : 1; const j = li+d;
      if(j<0 || j>=sec.lines.length) return;
      sec.lines.splice(j,0,sec.lines.splice(li,1)[0]); focusRef={si,li:j,pos:p}; render(); return;
    }
    if(e.key === "Enter"){ e.preventDefault(); step(si,li,1,0); return; }
    if(e.key === "Tab"){ e.preventDefault(); step(si,li,e.shiftKey?-1:1,0); return; }
    if(e.key === "ArrowUp"){ e.preventDefault(); step(si,li,-1,p); return; }
    if(e.key === "ArrowDown"){ e.preventDefault(); step(si,li,1,p); return; }
    if(e.key === "Backspace" && !RT(L.t) && io.selectionStart === 0){
      e.preventDefault();
      if(sec.lines.length > 1){ sec.lines.splice(li,1); focusRef={si,li:Math.max(0,li-1),pos:9999}; render(); }
      else step(si,li,-1,9999);
      return;
    }
    if(e.key === "ArrowLeft" && io.selectionStart === 0){ e.preventDefault(); step(si,li,-1,9999); }
    if(e.key === "ArrowRight" && io.selectionStart === io.value.length){ e.preventDefault(); step(si,li,1,0); }
  });

  paint(R,L);
  return R;
}

function showComp(R,comp,io,data){
  if(!data){ comp.style.display="none"; return; }
  const cells = [...R.querySelectorAll(".cell")];
  const cellPos = charToCell(CL(io.value), io.selectionStart);
  const c = cells[Math.min(cellPos, cells.length-1)];
  comp.textContent = data;
  if(c){ const w = R.querySelector(".wrap").getBoundingClientRect(); const r = c.getBoundingClientRect(); comp.style.left = (r.left-w.left)+"px"; }
  comp.style.display = "block";
}

function paint(R,L){
  const cells = R.querySelectorAll(".cell");
  const t = CL(RT(L.t)), C = cap(L);
  const has = i => t[i] !== undefined && t[i] !== " " && t[i] !== "　";
  cells.forEach((c,i)=>{
    c.classList.toggle("filled", has(i));
    if(!has(i)){ c.textContent = ""; return; }
    const cl = t[i];
    if(cl.length > 1){
      c.textContent = "";
      c.appendChild(document.createTextNode(cl[0]));
      const tail = el("span","tail"); tail.textContent = cl.slice(1);
      c.appendChild(tail);
    }else{
      c.textContent = cl;
    }
  });
  if(state.aid && aidReady()){
    cells.forEach((c,i)=>{
      if(!has(i)) return;
      const ch = t[i][0];
      // 平声和轻声不上底色 所以没东西要标时连元素都不建
      const cls = (pz(ch) === "ze" ? " ze" : "") + (pzAmbig(ch) ? " ambig" : "");
      if(cls) c.appendChild(el("i","pz" + cls));
    });
  }

  const over = t.slice(C).join("");
  const ov = R.querySelector(".ovf");
  ov.textContent = over ? "＋"+over : ""; ov.style.display = over ? "" : "none";
  R.querySelector(".cnt").textContent = t.slice(0,C).filter(c=>c !== " " && c !== "　").length + "/" + C;
  R.querySelector(".pat").textContent = L.g.join("/");
  queueAid();
}

/* paint 是在行还没插进 #doc 时调的（render 先建完整棵树再挂），
   所以推到微任务里跑；顺带把一次 render 里的 N 次调用合成一次。 */
let queued = false;
function queueAid(){
  if(queued) return;
  queued = true;
  Promise.resolve().then(()=>{ queued = false; paintAid(); });
}

/* 韵脚标在每行右边。槽位是按全篇统计的，改一个末字可能让整篇槽位重排，
   所以一次刷所有行，不是只刷当前行。 */
function paintAid(){
  const badges = document.querySelectorAll("#doc .row .rh");
  const blank = b => { b.className = "rh"; b.textContent = ""; b.removeAttribute("data-tip"); };
  if(!(state.aid && aidReady())){ badges.forEach(blank); return; }

  const { rows: info, slot } = rhymeSlots(state.sections);
  // 段落起始的行号，省得每行再从头累加一遍
  const base = [];
  for(let i=0,a=0;i<state.sections.length;i++){ base.push(a); a += state.sections[i].lines.length; }

  badges.forEach(b => {
    const R = b.parentNode;
    const x = info[base[+R.dataset.si] + +R.dataset.li];
    if(!x || x.y < 0){ blank(b); return; }
    b.className = "rh s" + Math.min(slot.get(x.y), 2);
    b.textContent = rhymeName(x.y);
    b.dataset.tip = t("rhTip", x.ch, rhymeName(x.y));
  });
}

function caret(R,L,pos){
  const cells = R.querySelectorAll(".cell");
  cells.forEach(c=>c.classList.remove("caret","end"));
  R.querySelectorAll(".grp").forEach(g=>g.classList.remove("cur"));
  if(!cells.length) return;
  const i = Math.min(pos, cells.length-1);
  cells[i].classList.add("caret");
  if(pos >= cells.length) cells[i].classList.add("end");
  const grps = R.querySelectorAll(".grp");
  const gi = groupAt(L, Math.min(pos, cells.length)).gi;
  if(grps[gi]) grps[gi].classList.add("cur");
}

/* 把输入框里的选区映射成"格子高亮"。透明输入框是单行的，原生选区高亮会沿单行画、
   和折行后的格子对不上；这里按 selectionStart/End 给区间内的格子加 .sel，高亮就永远
   跟着格子走。注意 selectionStart/End 是字符下标，要先经 charToCell 换成格子（簇）下标，
   否则遇到拗音/emoji 等多码点的格子会错位。选区为空（普通光标）时不高亮。 */
function paintSel(R){
  const io = R.querySelector(".io");
  const cells = R.querySelectorAll(".cell");
  const clusters = CL(io.value);
  const a = charToCell(clusters, io.selectionStart);
  const b = charToCell(clusters, io.selectionEnd);
  const s = Math.min(a,b), e = Math.max(a,b);
  cells.forEach((c,i)=> c.classList.toggle("sel", e > s && i >= s && i < e));
}

function redrawRow(si,li,pos){
  const R = document.querySelector('.row[data-si="'+si+'"][data-li="'+li+'"]');
  const L = state.sections[si].lines[li];
  const io = R.querySelector(".io");
  let p = pos === undefined ? charToCell(CL(io.value), io.selectionStart) : pos;   // 格子下标
  p = Math.min(p, cap(L));
  const nR = rowEl(state.sections[si], si, L, li);
  R.replaceWith(nR);
  const nio = nR.querySelector(".io");
  const charPos = cellToChar(CL(nio.value), p);
  nio.focus(); nio.setSelectionRange(charPos,charPos); nR._mark(nio.selectionStart);   // 读回真实光标
  save();
}

/* 光标所在的分句：返回 {gi 分句序号, start 该分句首格的全局序号, off 光标在分句内的位置} */
function groupAt(L,pos){
  let start = 0;
  for(let i=0;i<L.g.length;i++){
    if(pos < start + L.g[i] || i === L.g.length-1) return {gi:i, start, off:pos-start};
    start += L.g[i];
  }
  return {gi:0, start:0, off:0};
}

/* 在光标所在的分句里加 / 减一格 */
function chg(L,d,pos){
  const {gi} = groupAt(L, Math.max(0,pos|0));
  if(d > 0) L.g[gi]++;
  else if(L.g[gi] > 1) L.g[gi]--;
  else if(L.g.length > 1) L.g.splice(gi,1);
}

/* 在光标处断开分句；光标已在分句边界时则与相邻分句合并 */
function splitAt(L,pos){
  const {gi,off} = groupAt(L, Math.max(0,pos|0));
  const n = L.g[gi];
  if(off > 0 && off < n){ L.g.splice(gi,1,off,n-off); return t("toastSplitDone"); }
  if(off === 0 && gi > 0){ L.g.splice(gi-1,2,L.g[gi-1]+n); return t("toastMergedPrev"); }
  if(off >= n && gi < L.g.length-1){ L.g.splice(gi,2,n+L.g[gi+1]); return t("toastMergedNext"); }
  return null;
}

/* 拆成多句：.svp 导进来常常一整段挤成一句，靠这个手动分行。
   只在分句边界断，总格数不变，导入的时间戳不会因此失效。 */
async function openBreak(sec,si,L,li){
  if(L.g.length < 2){ toast(t("toastBreakNeedGroups")); return; }
  const C = cap(L), cl = CL(RT(L.t));
  const cells = Array.from({length:C}, (_,i) => cl[i] ?? "");
  const cuts = await askBreak(L.g, cells);
  if(!cuts || !cuts.length) return;
  const parts = breakLine(L, cuts);
  if(!parts) return;
  sec.lines.splice(li, 1, ...parts.map(norm));
  focusRef = {si, li, pos:0};
  render(); save();
  toast(t("toastBroken", parts.length));
}

/* 整句左移 / 右移一格。格子钉死之后没法再靠退格把写偏的一句整体挪回来，
   所以单给一个操作：只挪字，词格（L.g）一格不动。
   右移要求句尾还有空格子、左移要求第一格是空的，否则就会把字挤出词格丢掉——
   这两种情况直接拦住并说明原因，绝不悄悄吞字。
   返回值：拦住了就返回提示语，挪成了返回 null。 */
function shiftLine(L,d){
  const cur = RT(L.t), cl = CL(cur);
  if(!cl.length) return t("toastShiftEmpty");
  if(d > 0){
    if(cl.length >= cap(L)) return t("toastShiftNoRoom");
    L.t = " " + cur;
  }else{
    if(cl[0] !== " ") return t("toastShiftHead");
    L.t = cl.slice(1).join("");
  }
  return null;
}

function step(si,li,d,pos){
  let s = si, l = li + d;
  while(s >= 0 && s < state.sections.length){
    const n = state.sections[s].lines.length;
    if(l >= 0 && l < n) break;
    s += d; l = d > 0 ? 0 : (state.sections[s] ? state.sections[s].lines.length-1 : -1);
  }
  if(s < 0 || s >= state.sections.length) return;
  focusRef = {si:s, li:l, pos}; restoreFocus();
}

function restoreFocus(){
  if(!focusRef) return;
  const R = document.querySelector('.row[data-si="'+focusRef.si+'"][data-li="'+focusRef.li+'"]');
  if(!R) return;
  const io = R.querySelector(".io");
  const clusters = CL(io.value);
  const p = Math.min(focusRef.pos, clusters.length);   // focusRef.pos 是格子下标
  const charPos = cellToChar(clusters, p);
  io.focus(); io.setSelectionRange(charPos,charPos); R._mark(io.selectionStart);   // 读回真实光标
}

function moveSec(si,d){
  const j = si+d; if(j<0 || j>=state.sections.length) return;
  state.sections.splice(j,0,state.sections.splice(si,1)[0]); focusRef=null; render();
}

function editPattern(pat,L){
  const inp = el("input","pat-edit"); inp.value = L.g.join(" ");
  inp.placeholder = t("patEditPlaceholder");
  pat.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = ok=>{ if(done) return; done = true;
    if(ok){ const g = parseGroups(inp.value); if(g) L.g = g; }
    focusRef = null; render(); };
  inp.onkeydown = e=>{ if(e.key === "Enter"){ e.preventDefault(); commit(true); } if(e.key === "Escape") commit(false); };
  inp.onblur = ()=>commit(true);
}

// 命令式渲染的词格逐字搬进来 用 ref 直接操作 DOM 不改写成模板
// 外部改了整篇（导入 / AI 填词 / 切语言）就 redraw() 递增 ui.rev 触发重画
watch(() => ui.rev, render);
onMounted(render);

defineExpose({ render, redrawRow, restoreFocus, step, moveSec });
</script>

<template>
  <main id="doc"></main>
</template>
