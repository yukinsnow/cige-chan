import { $ } from './dom.js';

let tT = null;
function toast(m){ const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tT); tT = setTimeout(()=>t.classList.remove("show"),2200); }

export { toast };
