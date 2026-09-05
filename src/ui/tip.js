import { $ } from './dom.js';

let box = null, timer = 0, cur = null;

function ensure() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'tip';
  document.body.appendChild(box);
  return box;
}

function place(el, text) {
  const b = ensure();
  b.textContent = text;
  b.classList.add('show');
  const r = el.getBoundingClientRect(), t = b.getBoundingClientRect();
  const pad = 8;
  let x = r.left + r.width / 2 - t.width / 2;
  x = Math.max(pad, Math.min(x, innerWidth - t.width - pad));
  // 下方放不下就翻到上方
  let y = r.bottom + 6;
  const flip = y + t.height + pad > innerHeight;
  if (flip) y = r.top - t.height - 6;
  b.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}

function hide() {
  clearTimeout(timer); cur = null;
  if (box) box.classList.remove('show');
}

/* 用 data-tip 而不是 title：原生 tooltip 的外观由系统决定，在自绘窗口里格外突兀。
   委托到 document 上，动态生成的按钮（词格那些）不用另外绑。 */
export function initTips() {
  const find = e => e.target instanceof Element ? e.target.closest('[data-tip]') : null;
  addEventListener('pointerover', e => {
    const el = find(e);
    if (!el || el === cur) return;
    hide(); cur = el;
    timer = setTimeout(() => { if (cur === el) place(el, el.dataset.tip); }, 420);
  });
  addEventListener('pointerout', e => { if (find(e) === cur) hide(); });
  addEventListener('pointerdown', hide);
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, true);
}
