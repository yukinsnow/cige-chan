import { reactive } from 'vue';

/* webview 的 confirm() 在 Tauri 里被禁（点了直接返回 false），
   而且外观由系统定。自绘一个，用 Promise 保持调用处的写法不变：
   if(await ask(t("..."))) { ... } */
export const dlg = reactive({ shown: false, text: '', ok: '', cancel: '', resolve: null });

export function ask(text, labels = {}) {
  dlg.text = text;
  dlg.ok = labels.ok || '';
  dlg.cancel = labels.cancel || '';
  dlg.shown = true;
  return new Promise(r => { dlg.resolve = r; });
}

export function close(v) {
  dlg.shown = false;
  const r = dlg.resolve;
  dlg.resolve = null;
  if (r) r(v);
}
