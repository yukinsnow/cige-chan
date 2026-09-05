import { $ } from './dom.js';

export function closeAllMenus() {
  document.querySelectorAll('.menu.show').forEach(m => m.classList.remove('show'));
  document.querySelectorAll('.menubtn.open').forEach(b => b.classList.remove('open'));
}

/* 展开后按实际视口位置纠偏：默认贴触发按钮左边，超出视口右边界就往左挪，
   挪完万一又顶到左边界（窄屏、菜单本身比可用空间宽）就贴住左边界，不强求
   贴合按钮位置——总之保证菜单整个都在视口里，不会有一截看不见点不到。 */
function positionMenu(menu) {
  menu.style.left = '0px';
  const pad = 8;
  const r = menu.getBoundingClientRect();
  const overflowRight = r.right - (innerWidth - pad);
  if (overflowRight > 0) menu.style.left = (-overflowRight) + 'px';
  const r2 = menu.getBoundingClientRect();
  if (r2.left < pad) menu.style.left = (parseFloat(menu.style.left) + (pad - r2.left)) + 'px';
}

export function toggleMenu(e, menuId) {
  e.stopPropagation();
  const menu = $('#' + menuId), btn = e.currentTarget;
  const willOpen = !menu.classList.contains('show');
  closeAllMenus();
  if (willOpen) { menu.classList.add('show'); btn.classList.add('open'); positionMenu(menu); }
}
