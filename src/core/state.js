import { reactive } from 'vue';
import { RT } from './clusters.js';

const SAMPLE = [
  {name:"Verse", lines:[{g:[4,3],t:""},{g:[3,4],t:""},{g:[2,5],t:""},{g:[4,4],t:""}]},
  {name:"Chorus",  lines:[{g:[5,3],t:""},{g:[4,4],t:""},{g:[5,3],t:""},{g:[6],t:""}]}
];
// 别对 state 子对象做身份比较（=== / Set / indexOf）proxy 会破坏
const state = reactive({ title:"未命名歌曲", sections:JSON.parse(JSON.stringify(SAMPLE)), cell:44, theme:"system", lang:"zh", accent:"auto",
               exp:{alts:false,note:false}, bg:{mode:"none", color:"#1a1614", dim:.55, blur:0} });

// 界面状态 不持久化
let bg = "";
try{ bg = localStorage.getItem("cige.bg") || ""; }catch(e){}
const ui = reactive({ savedAt: null, saveFailed: false, dialog: null, bgImg: bg, dragging: false, rev: 0, sysDark: false, settingsTab: 'look' });

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
function normAll(){ for(const s of state.sections){ if(!Array.isArray(s.lines)) s.lines=[]; s.lines.forEach(norm); if(!s.lines.length) s.lines.push(newLine()); } }

// 整篇结构变了要重画词格 单句的增量更新走 WordGrid 内部的 paint
const redraw = () => { ui.rev++; };

export { SAMPLE, state, ui, redraw, newLine, norm, normAll };
