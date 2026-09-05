/* 歌词文本导出与导入的往返测试
 *
 * 跑法：node tests/roundtrip.test.mjs
 *
 * 钉的是「导出的歌词能被导入词格 TXT 原样读回来」。这条以前有三个 bug
 * （标题变歌词并逐轮累积、空句把段落断成两截、备选版本用 / 拼接而 / 是
 * 分句分隔符），修完之后靠这些用例守住。
 */
import { strict as assert } from 'node:assert';
import { state } from '../src/core/state.js';
import { parseTxt, lyrTxt } from '../src/core/txt.js';

let pass = 0, fail = 0;
function check(msg, fn) {
  try { fn(); console.log(`ok   ${msg}`); pass++; }
  catch (e) { console.log(`FAIL ${msg}\n     ${e.message.split('\n')[0]}`); fail++; }
}
const info = (msg) => console.log(`--   ${msg}`);

const L = (g, text = '', note = '') => ({ g, t: text, alts: [], note });
const cells = (secs) => secs.map(s => s.lines.map(l => l.g));
const full = (secs) => secs.map(s => [s.name, s.lines.map(l => [l.g, l.t, l.note])]);

/* 默认导出（不带备选、带备注）是要求可往返的那一档 */
const OPT = { alts: false, note: true };
const ALTOPT = { alts: true, note: true };

/* ---- 标题 ---- */
state.title = '未命名歌曲';
state.sections = [{ name: '主歌', lines: [L([4, 3], '你好世界我在这')] }];
check('标题被读回 state.title', () => {
  assert.equal(parseTxt(lyrTxt(OPT)).title, '未命名歌曲');
});
check('标题行不再变成多出来的「段落 1」', () => {
  assert.equal(parseTxt(lyrTxt(OPT)).secs.length, 1);
});
check('正文原样往返', () => {
  assert.deepEqual(full(parseTxt(lyrTxt(OPT)).secs),
    [['主歌', [[[4, 3], '你好世界我在这', '']]]]);
});

/* ---- 反复往返不累积（以前每轮多长一段标题）---- */
check('往返 3 次后段落数与标题都稳定', () => {
  let txt = lyrTxt(OPT);
  for (let i = 0; i < 3; i++) {
    const p = parseTxt(txt);
    state.title = p.title;
    state.sections = p.secs;
    txt = lyrTxt(OPT);
  }
  const r = parseTxt(txt);
  assert.equal(r.secs.length, 1);
  assert.equal(r.title, '未命名歌曲');
});

/* ---- 中间夹着整句空句（以前会把段落断成两截）---- */
state.title = '半成品';
state.sections = [{
  name: '主歌',
  lines: [L([4, 3], '你好世界我在这'), L([5, 2]), L([3], '再一句')],
}];
check('空句不再把段落断成两截，且格数保住', () => {
  const r = parseTxt(lyrTxt(OPT));
  assert.equal(r.secs.length, 1);
  assert.deepEqual(cells(r.secs), [[[4, 3], [5, 2], [3]]]);
  assert.equal(r.secs[0].lines[1].t, '');
});

/* ---- 备注 ---- */
state.sections = [{ name: '副歌', lines: [L([3], '再一句', '这里改一下')] }];
check('备注往返', () => {
  assert.deepEqual(full(parseTxt(lyrTxt(OPT)).secs),
    [['副歌', [[[3], '再一句', '这里改一下']]]]);
});

/* ---- 多段落、重名段落 ---- */
state.sections = [
  { name: '主歌', lines: [L([2, 4, 4], '执手人间烟火与你同行')] },
  { name: '副歌', lines: [L([2, 5], '且看碧水映红绫')] },
  { name: '主歌', lines: [L([4, 4, 5], '画舫轻摇烟波向晚隔水听清音')] },
];
check('重名段落各自保留，分句结构往返', () => {
  const r = parseTxt(lyrTxt(OPT));
  assert.deepEqual(r.secs.map(s => s.name), ['主歌', '副歌', '主歌']);
  assert.deepEqual(cells(r.secs), [[[2, 4, 4]], [[2, 5]], [[4, 4, 5]]]);
});

/* ---- 超出词格的字不被吞掉（groupOut 的溢出分支）---- */
state.sections = [{ name: 'A', lines: [L([4, 4, 3], '画舫轻摇烟波向晚隔水听清音')] }];
check('多出来的 2 字单独成一个分句，不丢字', () => {
  assert.deepEqual(cells(parseTxt(lyrTxt(OPT)).secs), [[[4, 4, 3, 2]]]);
});

/* ---- 备选版本用 ※ 分隔（以前用 / 会冲掉分句结构）---- */
state.sections = [{
  name: 'A',
  lines: [{ g: [2, 2], t: '你好世界', alts: ['另一写法', '第三种写法'], note: '这句再想想' }],
}];
check('带备选时分句、当前版本、备选、备注都正确', () => {
  const r = parseTxt(lyrTxt(ALTOPT)).secs[0].lines[0];
  assert.deepEqual(r.g, [2, 2]);
  assert.equal(r.t, '你好世界');
  assert.deepEqual(r.alts, ['另一写法', '第三种写法']);
  assert.equal(r.note, '这句再想想');
});
check('带备选往返 3 次后完全一致', () => {
  let txt = lyrTxt(ALTOPT);
  for (let i = 0; i < 3; i++) {
    state.sections = parseTxt(txt).secs;
    txt = lyrTxt(ALTOPT);
  }
  const r = parseTxt(txt).secs[0].lines[0];
  assert.deepEqual([r.g, r.t, r.alts, r.note],
    [[2, 2], '你好世界', ['另一写法', '第三种写法'], '这句再想想']);
});
check('关掉备选导出时只剩当前版本', () => {
  const r = parseTxt(lyrTxt(OPT)).secs[0].lines[0];
  assert.deepEqual(r.alts, []);
  assert.equal(r.t, '你好世界');
});

/* ---- 已知限制，只打印现状，不断言 ---- */
state.sections = [{ name: 'A', lines: [L([4, 3], '你好')] }];
info(`已知限制：分句没填满时（[4,3] 只写 2 字）读回来 g = ${JSON.stringify(parseTxt(lyrTxt(OPT)).secs[0].lines[0].g)}`);
info('  歌词文本只承载字、不承载格，要靠新的无损格式解决');

console.log(fail ? `\n${pass} 过 / ${fail} 失败` : `\n全部通过（${pass} 项）`);
process.exit(fail ? 1 : 0);
