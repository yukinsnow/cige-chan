import { reactive } from 'vue';

export const ctx = reactive({ shown: false, x: 0, y: 0, field: null, sel: '' });

export function openCtx(e) {
  const el = e.target instanceof Element ? e.target : null;
  const field = el?.closest('input:not([type=range]):not([type=color]),textarea');
  const sel = String(getSelection());
  // 词格的透明输入框选区取不到文字（字画在格子里），退回 selectionStart/End
  const inField = field && field.selectionStart !== field.selectionEnd
    ? field.value.slice(field.selectionStart, field.selectionEnd) : '';
  ctx.field = field || null;
  ctx.sel = inField || sel;
  ctx.x = e.clientX;
  ctx.y = e.clientY;
  ctx.shown = true;
}

export const closeCtx = () => { ctx.shown = false; ctx.field = null; };

function fire(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function ctxCopy() {
  if (ctx.sel) await navigator.clipboard.writeText(ctx.sel);
}

export async function ctxCut() {
  const f = ctx.field;
  if (!f || !ctx.sel) return;
  await navigator.clipboard.writeText(ctx.sel);
  const { selectionStart: a, selectionEnd: b } = f;
  f.value = f.value.slice(0, a) + f.value.slice(b);
  f.setSelectionRange(a, a);
  fire(f);
}

/* execCommand('paste') 在 webview 里被禁，只能读剪贴板自己插。
   读不到就让用户按 Ctrl+V——那条路走的是原生按键，不受权限限制。 */
export async function ctxPaste() {
  const f = ctx.field;
  if (!f) return null;
  const text = await navigator.clipboard.readText();
  const a = f.selectionStart, b = f.selectionEnd;
  f.value = f.value.slice(0, a) + text + f.value.slice(b);
  const at = a + text.length;
  f.setSelectionRange(at, at);
  fire(f);
  return text;
}

export function ctxSelectAll() {
  const f = ctx.field;
  if (f) { f.focus(); f.select(); }
}
