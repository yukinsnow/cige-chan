import { t } from '../i18n/index.js';
import { el } from '../ui/dom.js';
import { toast } from '../ui/toast.js';

/* 桌面版（Tauri）里走系统的保存对话框；在浏览器里就还是下载。
   两种环境共用同一份代码，浏览器打开这个文件时行为和以前完全一样。 */
const TAURI = (typeof window !== "undefined" && window.__TAURI__) ? window.__TAURI__ : null;

async function download(name,text){
  if(TAURI){
    const ext = (name.split(".").pop() || "txt").toLowerCase();
    try{
      const p = await TAURI.core.invoke("save_text",{
        defaultName: name,
        filterName: ext === "json" ? t("dlgFilterProject") : t("dlgFilterText"),
        exts: [ext],
        contents: text
      });
      /* 安卓只有 content:// URI，说不出存到哪；p 为 null 才是取消。 */
      if(p !== null) toast(p ? t("toastSavedTo", p) : t("toastSaved"));
    }catch(e){ toast(t("toastSaveFail", e)); }
    return;
  }
  const b = new Blob([text],{type:"text/plain;charset=utf-8"});
  const a = el("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
/* MIDI 是二进制，不能走上面那套（save_text 用 String 存内容，非 UTF-8
   字节会被弄坏），单独走 save_binary。 */
async function downloadBinary(name, bytes){
  if(TAURI){
    try{
      const p = await TAURI.core.invoke("save_binary", {
        defaultName: name, filterName: t("dlgFilterMidi"), exts: ["mid"], contents: Array.from(bytes)
      });
      /* 安卓只有 content:// URI，说不出存到哪；p 为 null 才是取消。 */
      if(p !== null) toast(p ? t("toastSavedTo", p) : t("toastSaved"));
    }catch(e){ toast(t("toastSaveFail", e)); }
    return;
  }
  const b = new Blob([bytes], {type:"audio/midi"});
  const a = el("a"); a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

export { TAURI, download, downloadBinary };
