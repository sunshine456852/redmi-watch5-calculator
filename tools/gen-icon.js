/**
 * 生成 192x192 应用图标（纯 Node，无第三方依赖）
 * 运行：node tools/gen-icon.js
 * 设计：暗色背景 + 橙色粘土计算器主体 + 深色屏幕 + 白色 "=" 号
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 192, H = 192;
const buf = Buffer.alloc(W * H * 4);

function px(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
}

function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, r, g, b);
}

function fillRoundedRect(x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let inside = true;
      // 判断是否在圆角矩形内
      const cx = Math.max(x0 + rad, Math.min(x, x1 - rad));
      const cy = Math.max(y0 + rad, Math.min(y, y1 - rad));
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > rad * rad) inside = false;
      if (inside) px(x, y, r, g, b);
    }
  }
}

// 背景
fillRect(0, 0, W, H, 0x0A, 0x0A, 0x0C);

// 计算器主体（橙色粘土）
fillRoundedRect(48, 30, 144, 162, 26, 0xFF, 0x9F, 0x0A);

// 屏幕（深色）
fillRoundedRect(62, 46, 130, 82, 10, 0x1A, 0x1A, 0x1E);

// 屏幕内的算式条
fillRoundedRect(70, 56, 122, 66, 4, 0x30, 0xD1, 0x58);

// "=" 两条白杠
fillRoundedRect(72, 100, 120, 112, 6, 0xF2, 0xF2, 0xF7);
fillRoundedRect(72, 122, 120, 134, 6, 0xF2, 0xF2, 0xF7);

// ---------- PNG 编码 ----------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// 原始扫描线（每行前置 filter byte 0）
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
]);

const out = path.join(__dirname, '..', 'src', 'Common', 'logo.png');
fs.writeFileSync(out, png);
console.log('已生成图标：' + out + ' (' + png.length + ' bytes)');
