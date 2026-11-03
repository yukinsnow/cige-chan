/* 外来工程的校验
 *
 * 跑法：node tests/validate.test.mjs
 *
 * 导入、打开、恢复都靠 validSections 拦坏文件，它放过去的东西会直接替换掉当前稿。
 */
import { strict as assert } from 'node:assert';
import { validSections } from '../src/core/state.js';

let pass = 0, fail = 0;
function check(msg, fn) {
  try { fn(); console.log(`ok   ${msg}`); pass++; }
  catch (e) { console.log(`FAIL ${msg}\n     ${e.message}`); fail++; }
}

check('坏结构一律 throw', () => {
  for (const bad of [null, [], [null], [{}], [{ lines: [null] }], [{ lines: [{ g: [] }] }],
                     [{ lines: [{ g: [-1] }] }], [{ lines: [{ g: [1.5] }] }], [{ lines: [{ g: [100000000] }] }]])
    assert.throws(() => validSections(bad), JSON.stringify(bad));
});

check('总格数超上限 throw', () => {
  const big = [{ lines: Array.from({ length: 60 }, () => ({ g: [1000] })) }];
  assert.throws(() => validSections(big));
});

check('多余字段丢掉 缺的补齐', () => {
  const [sec] = validSections([{ name: 1, extra: 1, lines: [{ g: [2], t: '你好', evil: 1 }] }]);
  assert.equal(sec.name, '');
  assert.deepEqual(Object.keys(sec).sort(), ['lines', 'name']);
  assert.deepEqual(sec.lines[0], { g: [2], t: '你好', alts: [], note: '' });
});

check('数字字符串的词格照收 旧工程里有', () => {
  assert.deepEqual(validSections([{ lines: [{ g: ['3', '4'] }] }])[0].lines[0].g, [3, 4]);
});

check('空段补一句 不留空段', () => {
  assert.equal(validSections([{ name: 'A', lines: [] }])[0].lines.length, 1);
});

console.log(fail ? `\n${fail} 项失败` : `\n全部通过（${pass} 项）`);
if (fail) process.exit(1);
