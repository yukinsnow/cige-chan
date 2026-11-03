const $ = s => document.querySelector(s);
const el = (t,c) => { const e=document.createElement(t); if(c) e.className=c; return e; };

// 选词时按的 Enter/Esc 是给输入法的 Safari 上 isComposing 不可靠 还得认 229
const imeKey = e => e.isComposing || e.keyCode === 229;

export { $, el, imeKey };
