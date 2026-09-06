import { reactive } from 'vue';

export const brk = reactive({ shown: false, g: [], cells: [], resolve: null });

/* 拆行弹窗：g 是分句字数，cells 是每格一个字素（空格代表没填）。
   返回「在第 i 个分句之后断开」的下标数组，取消返回 null。 */
export function askBreak(g, cells) {
  brk.g = [...g];
  brk.cells = [...cells];
  brk.shown = true;
  return new Promise(r => { brk.resolve = r; });
}

export function closeBreak(v) {
  brk.shown = false;
  const r = brk.resolve;
  brk.resolve = null;
  if (r) r(v);
}
