// 生成积分 tab 图标（五角星描边，200x200 RGBA PNG）
// 运行: node scripts/gen-points-icons.js
// 输出: miniprogram/images/icons/points.png（灰）与 points-active.png（橙）
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ---- CRC32（PNG chunk 校验）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;  // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(filePath, png);
}

// ---- 五角星几何 ----
function starVertices(cx, cy, outerR, innerR) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (-90 + i * 36) * Math.PI / 180;  // 一个顶点朝上
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx, qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function renderStar(size, outerR, innerR, strokeWidth, [r, g, b]) {
  const verts = starVertices(size / 2, size / 2, outerR, innerR);
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4;  // 4x4 超采样抗锯齿
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let minD = Infinity;
          for (let i = 0; i < 10; i++) {
            const a = verts[i], b2 = verts[(i + 1) % 10];
            minD = Math.min(minD, distToSegment(px, py, a[0], a[1], b2[0], b2[1]));
          }
          if (minD <= strokeWidth / 2) hits++;
        }
      }
      const alpha = Math.round((hits / (SS * SS)) * 255);
      const i = (y * size + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = alpha;
    }
  }
  return rgba;
}

const SIZE = 200;
const OUTER_R = 78, INNER_R = 38, STROKE = 14;
const outDir = path.join(__dirname, '..', 'miniprogram', 'images', 'icons');

// 未选中 #BCAAA4（--soft-fur），选中 #E8905C（--cat-nose），与现有 tab 图标同色系
writePng(path.join(outDir, 'points.png'), SIZE, renderStar(SIZE, OUTER_R, INNER_R, STROKE, [0xBC, 0xAA, 0xA4]));
writePng(path.join(outDir, 'points-active.png'), SIZE, renderStar(SIZE, OUTER_R, INNER_R, STROKE, [0xE8, 0x90, 0x5C]));
console.log('points icons generated');
