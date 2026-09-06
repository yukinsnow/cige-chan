/* 生成 public/rhyme.json：汉字 → 十三辙 + 声调。
   devDependency 里的 pinyin-pro 只在这里用，产物是提交进仓库的，
   跑 npm run gen:rhyme 才需要它。 */
import fs from 'node:fs';
import { pinyin } from 'pinyin-pro';

/* 押韵按韵腹+韵尾归组，介音不算：ian 和 an 都押 an，uo 和 e 都押 o/e。
   eng 和 ong 归一组是因为唱起来押得上，光看拼写会以为是两回事。
   er 单独一组：跟 i 拼写像但实际不押。 */
const GROUPS = [
  ['a',   ['a', 'ia', 'ua']],
  ['o/e', ['o', 'e', 'uo', 'io']],
  ['ie',  ['ê', 'ie', 'üe']],
  ['i/ü', ['i', 'ü', '-i']],
  ['u',   ['u']],
  ['ai',  ['ai', 'uai']],
  ['ei',  ['ei', 'uei']],
  ['ao',  ['ao', 'iao']],
  ['ou',  ['ou', 'iou']],
  ['an',  ['an', 'ian', 'uan', 'üan']],
  ['en',  ['en', 'in', 'uen', 'ün']],
  ['ang', ['ang', 'iang', 'uang']],
  ['eng', ['eng', 'ing', 'ong', 'iong', 'ueng']],
  ['er',  ['er']],
];
const FINAL2G = new Map();
GROUPS.forEach(([, fs_], i) => fs_.forEach(f => FINAL2G.set(f, i)));

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
                  'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's'];
// 整体认读音节：zi/shi 这类的韵母是舌尖元音，写作 -i，归一七
const FLAT_I = new Set(['zi', 'ci', 'si', 'zhi', 'chi', 'shi', 'ri']);
// y/w 是 i/u/ü 打头时的写法，得还原成真正的韵母
const YW = {
  yi: 'i', ya: 'ia', ye: 'ie', yao: 'iao', you: 'iou', yan: 'ian', yin: 'in',
  yang: 'iang', ying: 'ing', yong: 'iong', yo: 'io',
  yu: 'ü', yue: 'üe', yuan: 'üan', yun: 'ün',
  wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wei: 'uei', wan: 'uan',
  wen: 'uen', wang: 'uang', weng: 'ueng',
};

function finalOf(syl) {
  if (FLAT_I.has(syl)) return '-i';
  if (YW[syl]) return YW[syl];
  let rest = syl;
  for (const ini of INITIALS) {
    if (syl.startsWith(ini)) { rest = syl.slice(ini.length); break; }
  }
  const ini = syl.slice(0, syl.length - rest.length);
  // j/q/x 后面的 u 实际念 ü，n/l 后面的 ü 本来就写 ü
  if ('jqx'.includes(ini) && rest[0] === 'u') rest = 'ü' + rest.slice(1);
  rest = rest.replace(/^v/, 'ü');
  // iu / ui / un 是 iou / uei / uen 的省写
  return ({ iu: 'iou', ui: 'uei', un: ini ? 'uen' : 'uen' })[rest] || rest;
}

const code = (grp, tone) => String.fromCharCode(48 + grp * 5 + tone);

/* 表按码位下标存，不存字表：U+4E00–U+9FA5 里 20852/20902 都有读音，
   存字的话光字表就 61KB。r[cp - LO] 是主读音，空格表示没这个字。 */
const LO = 0x4e00, HI = 0x9fa5;
const primary = new Array(HI - LO + 1).fill(' ');
const mc = [], mr = [];
const unknown = new Set();

for (let cp = LO; cp <= HI; cp++) {
  const ch = String.fromCodePoint(cp);
  const one = pinyin(ch, { type: 'array', toneType: 'num' })[0];
  if (!one || one === ch) continue;
  const all = pinyin(ch, { multiple: true, type: 'array', toneType: 'num' });
  const codes = [];
  for (const p of (all.length ? all : [one])) {
    const m = /^([a-zêü]+)([0-5]?)$/.exec(p);
    if (!m) { unknown.add(p); continue; }
    const f = finalOf(m[1]);
    const grp = FINAL2G.get(f);
    if (grp === undefined) { unknown.add(p + ' → ' + f); continue; }
    const c = code(grp, +(m[2] || 0) % 5);
    if (!codes.includes(c)) codes.push(c);
  }
  if (!codes.length) continue;
  primary[cp - LO] = codes[0];
  if (codes.length > 1) { mc.push(ch); mr.push(codes.join('')); }
}

// 多音字另存两条平行串，用定长对齐，省掉 JSON 对象的引号和逗号
const w = Math.max(...mr.map(x => x.length));
const out = {
  y: GROUPS.map(([n]) => n),
  lo: LO,
  r: primary.join(''),
  mc: mc.join(''),
  mw: w,
  mr: mr.map(x => x.padEnd(w, ' ')).join(''),
};
fs.writeFileSync('public/rhyme.json', JSON.stringify(out), 'utf8');
const sz = fs.statSync('public/rhyme.json').size;
console.log('有读音 ' + primary.filter(x => x !== ' ').length
  + '  多音字 ' + mc.length + ' (最多 ' + w + ' 读)  '
  + (sz / 1024).toFixed(1) + ' KB');
if (unknown.size) console.log('没归类：' + [...unknown].join(' '));
