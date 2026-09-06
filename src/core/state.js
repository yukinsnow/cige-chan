import { reactive } from 'vue';
import { CL, RT } from './clusters.js';

const SAMPLE = [
  {name:"Verse", lines:[{g:[4,3],t:""},{g:[3,4],t:""},{g:[2,5],t:""},{g:[4,4],t:""}]},
  {name:"Chorus",  lines:[{g:[5,3],t:""},{g:[4,4],t:""},{g:[5,3],t:""},{g:[6],t:""}]}
];
// 别对 state 子对象做身份比较（=== / Set / indexOf）proxy 会破坏
const state = reactive({ title:"未命名歌曲", sections:JSON.parse(JSON.stringify(SAMPLE)), cell:44, theme:"system", lang:"zh", accent:"auto",
               exp:{alts:false,note:false}, lrc:{offset:0, word:false}, aid:false, bg:{mode:"none", color:"#1a1614", dim:.55, blur:0} });

// 界面状态 不持久化
let bg = "";
try{ bg = localStorage.getItem("cige.bg") || ""; }catch(e){}
const ui = reactive({ savedAt: null, saveFailed: false, dialog: null, bgImg: bg, dragging: false, rev: 0, sysDark: false, settingsTab: 'look', timing: null });

/* 一句的结构：{ g:[分句字数], t:当前版本文字, alts:[其它备选版本], note:备注 } */
function newLine(g){ return {g:[...(g||[7])], t:"", alts:[], note:""}; }
function norm(L){
  if(!Array.isArray(L.g) || !L.g.length) L.g = [7];
  L.g = L.g.map(n=>Math.max(1,n|0));
  if(typeof L.t !== "string") L.t = "";
  L.alts = Array.isArray(L.alts) ? [...new Set(L.alts.filter(x=>typeof x === "string").map(RT).filter(x=>x))] : [];
  if(typeof L.note !== "string") L.note = "";
  return L;
}
/* 把一句按分句边界拆成几句 cuts 是「在第 i 个分句之后断开」的下标。
   总格数不变 所以导入的时间戳拆完还对得上 */
function breakLine(L, cuts){
  const at = [...new Set(cuts.map(Number))].filter(i => i > 0 && i < L.g.length).sort((a,b)=>a-b);
  if(!at.length) return null;
  const bd = [0, ...at, L.g.length];
  const spans = bd.slice(1).map((e,k) => L.g.slice(bd[k], e).reduce((a,x)=>a+x, 0));
  const cut = s => {
    const cl = CL(s), out = [];
    let i = 0;
    for(const n of spans){ out.push(RT(cl.slice(i, i+n).join(""))); i += n; }
    // 超出词格的字留在最后一句 不能吞掉
    if(i < cl.length) out[out.length-1] += cl.slice(i).join("");
    return out;
  };
  const ts = cut(L.t), as = L.alts.map(cut);
  return ts.map((t, k) => ({
    g: L.g.slice(bd[k], bd[k+1]),
    t,
    alts: as.map(a => a[k]).filter(x => x),
    note: k ? "" : L.note,
  }));
}

function normAll(){ for(const s of state.sections){ if(!Array.isArray(s.lines)) s.lines=[]; s.lines.forEach(norm); if(!s.lines.length) s.lines.push(newLine()); } }

// 整篇结构变了要重画词格 单句的增量更新走 WordGrid 内部的 paint
const redraw = () => { ui.rev++; };

export { SAMPLE, state, ui, redraw, newLine, norm, normAll, breakLine };
