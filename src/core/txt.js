import { CL, RT } from './clusters.js';
import { state } from './state.js';
import { t } from '../i18n/index.js';

/* ================= parsing ================= */
const PH_RE   = /^[XxＸｘ×✕✖○●◯□■_＿oO〇\-–—.·、]+$/;
const PUNCT_RE= /[，。！？、；：""''「」『』（）《》〈〉…—～~,.!?;:'"()\[\]]/g;
const HEAD_RE = /^\s*(?:[\[【(（#＃]\s*)?((?:pre[\s-]?chorus|verse|chorus|bridge|intro|outro|hook|refrain|rap|drop|tag)\s*\d*|主歌\s*\d*|副歌\s*\d*|预?副歌|导歌|桥段|前奏|间奏|尾奏|说唱|独白|和声)\s*(?:[\]】)）]|[:：])?\s*$/i;
/* 跟导出时的写法对应：一句末尾的（……）当备注，不占格子、不计入格数。
   只认"贴在行尾"的括号，行首或行中的括号仍然当成普通标点（见 06 号用例），
   这样才不会跟原有的"括号里的字也算歌词"行为冲突。 */
const NOTE_RE = /[（(]\s*([^（）()]*?)\s*[）)]\s*$/;
// 只认第一行 否则会吃掉歌词正文里的书名号
const TITLE_RE = /^《\s*(.*?)\s*》$/;

// 不能用 / ｜ 那些 它们是分句分隔符 数字词格 4/5/6 还依赖着
const ALT_SEP = "※";

// 备选共用当前版本的 L.g 所以只有第一段的 g 有用
function splitCells(s){
  const toks = s.split(/[\s　|｜/／]+/).filter(Boolean);
  const g = []; let t = "";
  for(const tk of toks){
    if(PH_RE.test(tk)){ g.push([...tk].length); continue; }
    const clean = CL(tk.replace(PUNCT_RE,""));
    if(!clean.length) continue;
    g.push(clean.length); t += clean.join("");
  }
  return {g,t};
}

function parseContentLine(s){
  let note = "";
  const nm = s.match(NOTE_RE);
  if(nm){ note = nm[1].trim(); s = s.slice(0, nm.index).trim(); }
  if(!s) return null;   // 整行只有一对括号、没有歌词本体，不当成一句
  if(/^\d+(\s*[+\-,，、\/／·\s]\s*\d+)*$/.test(s)){
    const g = s.split(/\D+/).filter(Boolean).map(Number).filter(n=>n>0);
    return g.length ? {g,t:"",alts:[],note} : null;
  }
  const parts = s.split(ALT_SEP).map(x=>x.trim()).filter(Boolean);
  const { g, t } = splitCells(parts[0] || "");
  const alts = parts.slice(1).map(x=>splitCells(x).t).filter(Boolean);
  return g.length ? {g,t,alts,note} : null;
}

function parseTxt(text){
  const raw = text.replace(/\r/g,"").split("\n");
  const secs = []; let cur = null, title = "", first = true;
  for(const line of raw){
    const s = line.trim();
    if(!s){ if(cur && cur.lines.length) cur = null; continue; }
    if(first){ first = false; const tm = s.match(TITLE_RE); if(tm){ title = tm[1]; continue; } }
    let name = null;
    const m = s.match(HEAD_RE);
    if(m) name = m[1].trim();
    else if(/^[\[【].{1,24}[\]】]$/.test(s)) name = s.slice(1,-1).trim();
    if(name){ cur = {name, lines:[]}; secs.push(cur); continue; }
    if(!cur){ cur = {name:t("autoSectionName", secs.length+1), lines:[]}; secs.push(cur); }
    const pl = parseContentLine(s);
    if(pl) cur.lines.push(pl);
  }
  return {title, secs: secs.filter(x=>x.lines.length)};
}

function parseGroups(str){
  const s = str.trim();
  if(!s) return null;
  if(/^\d+(\s*[+\-,，、\/／·\s]\s*\d+)*$/.test(s)){
    const g = s.split(/\D+/).filter(Boolean).map(Number).filter(n=>n>0&&n<100);
    return g.length ? g : null;
  }
  const g = s.split(/[\s　|｜/／+]+/).filter(Boolean).map(t=>[...t].length).filter(n=>n>0);
  return g.length ? g : null;
}

const patTxt = ()=> state.sections.map(s=>"["+s.name+"]\n"+s.lines.map(l=>l.g.map(n=>"X".repeat(n)).join(" ")).join("\n")).join("\n\n")+"\n";

/* 按 L.g 把一句切回各个分句、中间留一个空格，导出的歌词才看得出句内的停顿在哪，
   不会几个分句糊成一坨；写法也正好跟词格的 XXXX XXX 对上，导出的歌词能被
   「导入词格 TXT」原样读回来（parseContentLine 就是按空白切分句的）。
   还没填的格子是占位空格，整个分句都空着就不输出这一段。 */
const TRIM = s => String(s).replace(/^[ 　]+|[ 　]+$/g,"");
function groupOut(text,g){
  const cl = CL(text), parts = [];
  let i = 0;
  for(const n of g){ parts.push(TRIM(cl.slice(i,i+n).join(""))); i += n; }
  if(i < cl.length) parts.push(TRIM(cl.slice(i).join("")));   // 万一有超出词格的字，也不吞掉
  return parts.filter(x=>x).join(" ");
}

/* 一句导出成什么样：o.alts 是否带上全部备选，o.note 是否带上备注 */
function lineOut(L,o){
  const cur = RT(L.t);
  const list = o.alts ? [cur, ...L.alts.filter(x=>x !== cur)] : [cur];
  let s = list.filter(x=>x).map(x=>groupOut(x,L.g)).filter(x=>x).join(ALT_SEP);
  // 空行在 parseTxt 里是段落分隔符 整句未填必须退回 XXXX 否则导入时会断段
  if(!s) s = L.g.map(n=>"X".repeat(n)).join(" ");
  if(o.note && L.note) s += "（" + L.note + "）";
  return s;
}
function lyrTxt(o){
  o = o || {alts:false, note:false};
  return "《"+state.title+"》\n\n"
    + state.sections.map(s=>"["+s.name+"]\n"+s.lines.map(L=>lineOut(L,o)).join("\n")).join("\n\n")+"\n";
}

export { PH_RE, PUNCT_RE, HEAD_RE, NOTE_RE, TITLE_RE, ALT_SEP,
         splitCells, parseContentLine, parseTxt, parseGroups,
         TRIM, groupOut, lineOut, patTxt, lyrTxt };
