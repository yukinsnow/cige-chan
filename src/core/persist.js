import { state, ui, validSections } from './state.js';

let saveT = null, dirty = false;
// 返回 false 时 dirty 留着 下次 save 或 pagehide 再试
function flushSave(){
  clearTimeout(saveT); saveT = null;
  if(!dirty) return true;
  try{ localStorage.setItem("cige.v1", JSON.stringify(state)); dirty = false; ui.savedAt = Date.now(); ui.saveFailed = false; return true; }
  catch(e){ ui.saveFailed = true; return false; }
}
function save(){ dirty = true; clearTimeout(saveT); saveT = setTimeout(flushSave,400); }

function load(){
  let s = null;
  try{ s = localStorage.getItem("cige.v1"); if(!s) return false;
    const o = JSON.parse(s);
    if(o && Array.isArray(o.sections) && o.sections.length){ o.sections = validSections(o.sections); Object.assign(state,o); return true; }
  }catch(e){
    // 读不进来就会显示示例 紧接着的自动保存会把原稿盖掉 先挪到一边
    try{ if(s) localStorage.setItem("cige.v1.bad", s); }catch(e){}
  }
  return false;
}

// 整篇被替换前留一份 只留最近一次 恢复时当前这份又成为备份 所以是来回切
const RECOVERY = "cige.recovery.v1";
function checkpoint(){
  localStorage.setItem(RECOVERY, JSON.stringify({title:state.title, sections:state.sections, exp:state.exp}));
}
function recovery(){ return localStorage.getItem(RECOVERY); }

export { save, flushSave, load, checkpoint, recovery };
