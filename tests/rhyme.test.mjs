/* 押韵分组与平仄判定
 *
 * 跑法：node tests/rhyme.test.mjs
 *
 * public/rhyme.json 是 scripts/gen-rhyme.mjs 生成的，改了生成器一定要跑这个。
 * 韵母省写（iu/ui/un）、整体认读（zhi/ri）、j/q/x 后的 u 念 ü，
 * 这几处错了肉眼很难发现——押韵提示会静悄悄地给错答案。
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { install, reads, pz, pzAmbig, rhymeName, tailChar, rhymeSlots } from '../src/core/rhyme.js';

install(JSON.parse(readFileSync(new URL('../public/rhyme.json', import.meta.url), 'utf8')));

let pass = 0, fail = 0;
function check(msg, fn) {
  try { fn(); console.log(`ok   ${msg}`); pass++; }
  catch (e) { console.log(`FAIL ${msg}\n     ${e.message}`); fail++; }
}
const grp = ch => rhymeName(reads(ch)[0].y);
const same = s => {
  const list = [...s].map(grp);
  assert.equal(new Set(list).size, 1, `${s} → ${list.join('/')}`);
  return list[0];
};

check('同韵的字归一组', () => {
  assert.equal(same('天前眠年'), 'an');
  assert.equal(same('光阳窗床'), 'ang');
  assert.equal(same('风声情星'), 'eng');
  assert.equal(same('鸟标笑'), 'ao');
});
check('韵母省写要还原 iu→iou ui→uei un→uen', () => {
  assert.equal(same('九秋刘游'), 'ou');
  assert.equal(same('水贵累谁'), 'ei');
  assert.equal(same('春论军群'), 'en');
});
check('j/q/x 后面的 u 念 ü', () => {
  assert.equal(same('居鱼虚区'), 'i/ü');
  assert.equal(same('雪月缺学'), 'ie');
});
check('整体认读音节归 i 组', () => {
  assert.equal(same('知吃诗日字词思'), 'i/ü');
});
check('er 单独一组 不跟 i 混', () => {
  assert.equal(same('儿而二'), 'er');
  assert.notEqual(grp('儿'), grp('衣'));
});
check('平仄只看主读音 一二声平 三四声仄', () => {
  for (const c of '天光高飞') assert.equal(pz(c), 'ping', c);
  for (const c of '我想你笑') assert.equal(pz(c), 'ze', c);
});
check('轻声不算平也不算仄', () => {
  assert.equal(pz('的'), 'light');
  assert.equal(pz('了'), 'light');
});
check('异读跨平仄才提示 只换韵的不提示', () => {
  assert.equal(pzAmbig('重'), true);    // zhòng 仄 / chóng 平
  assert.equal(pzAmbig('还'), false);   // hái / huán 都是平
  assert.equal(pzAmbig('天'), false);
});
check('表里没有的字返回空 不抛错', () => {
  assert.equal(reads('A'), null);
  assert.equal(reads('，'), null);
  assert.equal(pz('？'), '');
  assert.equal(pzAmbig('x'), false);
});

check('韵脚取末字 没填满取最后一个已填的字', () => {
  assert.equal(tailChar({ g: [4, 3], t: '黑白色彩的旧相' }), '相');
  assert.equal(tailChar({ g: [4, 3], t: '黑白' }), '白');
  assert.equal(tailChar({ g: [4, 3], t: '' }), '');
  assert.equal(tailChar({ g: [4, 3], t: '黑白色彩   ' }), '彩');   // 尾部占位空格不算
});
check('槽位按出现次数排 主韵拿 0 号', () => {
  const secs = [{ name: 'A', lines: [
    { g: [2], t: '明天' }, { g: [2], t: '流年' }, { g: [2], t: '从前' },   // 言前 ×3
    { g: [2], t: '月光' },                                                // 江阳 ×1
  ] }];
  const { rows, slot } = rhymeSlots(secs);
  assert.deepEqual(rows.map(r => r.ch), ['天', '年', '前', '光']);
  assert.equal(slot.get(rows[0].y), 0, 'an 该拿 0 号');
  assert.equal(slot.get(rows[3].y), 1);
});
check('空句和没读音的末字不参与分组', () => {
  const { rows } = rhymeSlots([{ name: 'A', lines: [{ g: [2], t: '' }, { g: [2], t: '明天' }] }]);
  assert.equal(rows[0].y, -1);
  assert.equal(rows[1].y >= 0, true);
});

console.log(fail ? `\n${pass} 过 / ${fail} 失败` : `\n全部通过（${pass} 项）`);
process.exit(fail ? 1 : 0);
