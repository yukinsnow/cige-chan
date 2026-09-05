/* WebKit 没有「已填区间」的伪元素，只能把进度算成轨道的渐变。
   委托到 document，所以动态出现的滑块（设置各页切换）不用另外绑。 */
const paint = el => {
  const min = +el.min || 0, max = +el.max || 100;
  const pct = max > min ? (el.value - min) / (max - min) * 100 : 0;
  el.style.setProperty('--fill', pct + '%');
};

const all = () => document.querySelectorAll('input[type="range"]').forEach(paint);

export function initSliders() {
  addEventListener('input', e => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') paint(e.target);
  });
  // 面板是 v-if 出现的，DOM 变了要重算一遍
  new MutationObserver(all).observe(document.body, { childList: true, subtree: true });
  all();
}
