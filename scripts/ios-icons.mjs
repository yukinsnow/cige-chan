/* 去掉 icons/ios/ 里每张图的 alpha 通道
 *
 * 用法：npx tauri icon <源图>  之后跑一次  npm run ios:icons
 *
 * iOS 不接受带 alpha 的 AppIcon，App Store 校验会以 ITMS-90717 退回来。
 * tauri icon 从带透明背景的源图生成，产出的 18 张全是 colorType=6，
 * 所以每次重新生成图标都要补跑这一步。
 *
 * 全透明像素若有，压到白底上再警告：那说明源图背景是透明的，
 * 在 iOS 上会显示成一块白，该去改源图而不是在这儿凑合。
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const DIR = new URL('../src-tauri/icons/ios/', import.meta.url);
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return b => {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function decode(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const name = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 6 && type !== 2))
    throw new Error(`只认 8 位非隔行的 RGB/RGBA，这张是 depth=${depth} type=${type} interlace=${interlace}`);

  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const line = raw.subarray(o, o + stride);
    o += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, bpp, stride, px: out };
}

function encode(w, h, rgb, stride) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const lines = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    lines[y * (stride + 1)] = 0;
    rgb.copy(lines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(lines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let done = 0, warned = 0;
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.png')).sort()) {
  const src = fs.readFileSync(new URL(f, DIR));
  const img = decode(src);
  if (img.bpp === 3) { console.log(`  ${f.padEnd(26)} 本来就是 RGB，跳过`); continue; }

  const rgb = Buffer.alloc(img.w * img.h * 3);
  let transparent = 0;
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    const a = img.px[i * 4 + 3];
    if (a === 0) transparent++;
    // 半透明的都是 254 这种取整残渣，直接当不透明；真透明的压到白底
    const k = a / 255;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(img.px[i * 4 + c] * k + 255 * (1 - k));
  }
  fs.writeFileSync(new URL(f, DIR), encode(img.w, img.h, rgb, img.w * 3));
  done++;
  if (transparent) { warned++; console.log(`  ${f.padEnd(26)} ⚠ ${transparent} 个全透明像素已压成白底`); }
}
console.log(`\n处理 ${done} 张，全部改为无 alpha 的 RGB`);
if (warned) console.log(`其中 ${warned} 张有全透明像素：iOS 上会显示成白块，去改源图的背景`);
