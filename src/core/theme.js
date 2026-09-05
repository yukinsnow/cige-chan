import { state, ui } from './state.js';
import { save } from './persist.js';

const mq = matchMedia('(prefers-color-scheme: dark)');
ui.sysDark = mq.matches;
mq.addEventListener('change', e => { ui.sysDark = e.matches; applyBg(); });

const isDark = () => state.theme === 'system' ? ui.sysDark : state.theme === 'dark';
import { t } from '../i18n/index.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

/* ---------- 主题色（换色调） ---------- */
const ACCENTS = [
  { id:"auto",   dark:"#e8b457", light:"#a8632a" },  // 跟主题自带的强调色一致
  { id:"blue",   dark:"#5ab4d8", light:"#3389D1" },
  { id:"green",  dark:"#7fbf8e", light:"#3e7d4f" },
  { id:"violet", dark:"#b39ddb", light:"#6a4fa3" },
  { id:"rose",   dark:"#e08a97", light:"#b5485d" },
  { id:"cyan",   dark:"#6fd6c8", light:"#2a8f85" },
  { id:"orange", dark:"#f0a35e", light:"#c96f1f" },
  { id:"slate",  dark:"#9aa7b5", light:"#5a6673" },
  { id:"red",    dark:"#e06655", light:"#b03a2e" },
];

function applyAccent(){
  const a = state.accent;
  if(a && a !== "auto" && ACCENTS.some(x => x.id === a)) document.documentElement.dataset.accent = a;
  else delete document.documentElement.dataset.accent;   // auto：走主题自带配色
}

function saveBg(){
  try{
    if(ui.bgImg) localStorage.setItem("cige.bg", ui.bgImg);
    else localStorage.removeItem("cige.bg");
  }catch(e){ toast(t("toastImgTooBig")); }
}

function applyBg(){
  const b = state.bg, root = document.documentElement;
  const img = $("#bgimg"), mask = $("#bgmask");
  // 跟随系统时不设 data-theme，交给 CSS 里的 prefers-color-scheme
  if(state.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = state.theme;
  if(b.mode === "image" && ui.bgImg){
    img.style.backgroundImage = 'url("' + ui.bgImg + '")';
    img.style.backgroundColor = "";
    img.style.filter = b.blur ? "blur(" + b.blur + "px)" : "";
    img.style.transform = b.blur ? "scale(1.1)" : "";   // 放大一点，盖住模糊后的透明边
    mask.style.display = ""; mask.style.opacity = b.dim;
    root.classList.add("has-bg");
  }else if(b.mode === "color"){
    img.style.backgroundImage = "none";
    img.style.backgroundColor = b.color;
    img.style.filter = ""; img.style.transform = "";
    mask.style.display = "none";
    root.classList.add("has-bg");
  }else{
    img.style.backgroundImage = "none";
    img.style.backgroundColor = "";
    img.style.filter = ""; img.style.transform = "";
    mask.style.display = "none";
    root.classList.remove("has-bg");
  }
}

/* 颜色的相对亮度，用来决定配深色还是浅色的字 */
function lum(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if(!m) return 0;
  const n = parseInt(m[1],16), f = v=>{ v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
  return .2126*f(n>>16&255) + .7152*f(n>>8&255) + .0722*f(n&255);
}

const SWATCH = ["#12100e","#1b2430","#24201a","#2b2430","#e9e2d3","#f0ece1","#dfe6e3","#f5e6d3"];

function setBgColor(c){
  state.bg.color = c; state.bg.mode = "color";
  state.theme = lum(c) > .5 ? "light" : "dark";   // 亮底自动配深色字，反之亦然
  applyBg(); save();
}

function loadBgImage(file){
  if(!file || !/^image\//.test(file.type || "")){ toast(t("toastNotImage")); return; }
  const fr = new FileReader();
  fr.onerror = ()=>toast(t("toastFileUnreadable"));
  fr.onload = ()=>{
    const im = new Image();
    im.onerror = ()=>toast(t("toastImageUnopenable"));
    im.onload = ()=>{
      const MAX = 1920;
      const s = Math.min(1, MAX / Math.max(im.width, im.height));
      const w = Math.max(1,Math.round(im.width*s)), h = Math.max(1,Math.round(im.height*s));
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(im,0,0,w,h);
      let uri = cv.toDataURL("image/jpeg", .82);
      if(uri.length > 2.6e6) uri = cv.toDataURL("image/jpeg", .6);   // 还是太大就再压一档
      ui.bgImg = uri; state.bg.mode = "image";
      applyBg(); saveBg(); save();
      toast(t("toastBgChanged", w, h, Math.round(uri.length/1365)));
    };
    im.src = fr.result;
  };
  fr.readAsDataURL(file);
}

export { ACCENTS, SWATCH, lum, isDark, applyAccent, applyBg, saveBg, setBgColor, loadBgImage };
