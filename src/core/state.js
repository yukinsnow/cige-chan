/* 工程数据模型。只依赖 clusters，不碰 i18n 和 DOM。
 */

import { RT } from './clusters.js';

const SAMPLE = [
  {name:"Verse", lines:[{g:[4,3],t:""},{g:[3,4],t:""},{g:[2,5],t:""},{g:[4,4],t:""}]},
  {name:"Chorus",  lines:[{g:[5,3],t:""},{g:[4,4],t:""},{g:[5,3],t:""},{g:[6],t:""}]}
];
let state = { title:"未命名歌曲", sections:JSON.parse(JSON.stringify(SAMPLE)), cell:44, theme:"dark", lang:"zh", accent:"auto",
               exp:{alts:false,note:false}, bg:{mode:"none", color:"#1a1614", dim:.55, blur:0} };

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

export { SAMPLE, state, newLine, norm, normAll };
