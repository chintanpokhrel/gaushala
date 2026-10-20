// Draws the app icons (the Android launcher icon's milk bottle) as PNGs into public/.
// Run once after changing the design: node scripts/icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const BG = [0x2f, 0x5d, 0x8a];
const WHITE = [0xff, 0xff, 0xff];

// Same shapes as android/app/src/main/res/drawable/ic_launcher_foreground.xml (108-unit viewport),
// with the rounded bottom corners flattened into short segments.
function quad(p0, c, p1, steps = 8) {
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push([(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]);
  }
  return out;
}
const bottle = [
  [46, 26], [62, 26], [62, 32], [60, 32], [60, 38], [68, 48], [68, 80],
  ...quad([68, 80], [68, 84], [64, 84]), [44, 84],
  ...quad([44, 84], [40, 84], [40, 80]), [40, 48], [48, 38], [48, 32], [46, 32],
];
const band = [[40, 58], [68, 58], [68, 68], [40, 68]];

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** [view] = the part of the 108-unit viewport shown: Android's visible 72 units, or all 108 for maskable. */
function draw(size, view) {
  const off = (108 - view) / 2;
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // supersampling per axis, for smooth edges
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = off + ((px + (sx + 0.5) / ss) / size) * view;
          const y = off + ((py + (sy + 0.5) / ss) / size) * view;
          const c = inside(bottle, x, y) && !inside(band, x, y) ? WHITE : BG;
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = r / ss / ss; rgba[i + 1] = g / ss / ss; rgba[i + 2] = b / ss / ss; rgba[i + 3] = 255;
    }
  }
  return png(size, rgba);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
fs.writeFileSync(new URL('apple-touch-icon.png', out), draw(180, 72));
fs.writeFileSync(new URL('icon-192.png', out), draw(192, 72));
fs.writeFileSync(new URL('icon-512.png', out), draw(512, 72));
fs.writeFileSync(new URL('icon-maskable-512.png', out), draw(512, 108));
console.log('icons written');
