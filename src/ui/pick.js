import { reactive } from 'vue';

export const pick = reactive({
  shown: false, title: '', hint: '', options: [], multi: false, preset: [], resolve: null,
});

/* 从一组选项里挑：单选返回那个值，多选返回数组，取消都返回 null。
   options: [{ v, label, desc }] */
export function askPick(title, options, opts = {}) {
  pick.title = title;
  pick.hint = opts.hint || '';
  pick.options = options;
  pick.multi = !!opts.multi;
  pick.preset = opts.preset || [];
  pick.shown = true;
  return new Promise(r => { pick.resolve = r; });
}

export function closePick(v) {
  pick.shown = false;
  const r = pick.resolve;
  pick.resolve = null;
  if (r) r(v);
}
