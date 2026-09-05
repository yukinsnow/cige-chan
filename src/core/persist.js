import { state, ui } from './state.js';

let saveT = null;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(()=>{
    try{ localStorage.setItem("cige.v1", JSON.stringify(state)); ui.savedAt = Date.now(); ui.saveFailed = false; }
    catch(e){ ui.saveFailed = true; }
  },400);
}
function load(){
  try{ const s = localStorage.getItem("cige.v1"); if(!s) return false;
    const o = JSON.parse(s);
    if(o && Array.isArray(o.sections) && o.sections.length){ Object.assign(state,o); return true; }
  }catch(e){}
  return false;
}

export { save, load };
