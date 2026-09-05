import { TAURI } from './save.js';

/* Tauri 的 webview 不处理 target="_blank"，点了没反应。
   走 opener 插件交给系统浏览器；网页版保持 <a> 原生行为。 */
export function openExternal(url) {
  if (!TAURI) return false;
  TAURI.core.invoke('plugin:opener|open_url', { url });
  return true;
}

export function bindExternalLinks() {
  if (!TAURI) return;
  addEventListener('click', e => {
    const a = e.target instanceof Element ? e.target.closest('a[href^="http"]') : null;
    if (!a) return;
    e.preventDefault();
    openExternal(a.href);
  });
}
