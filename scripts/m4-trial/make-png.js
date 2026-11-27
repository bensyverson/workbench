// Writes the game leg's sprite sheet: `node scripts/m4-trial/make-png.js <out.png>`. A 32-by-16 RGBA PNG of two
// 16-by-16 cells, cell 0 a figure (the player) and cell 1 a gem, drawn from the two pictures below so it is the same
// file every time. No dependency: zlib's deflate and crc32.

import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const FIGURE = [
  "......XXXX......",
  ".....XXXXXX.....",
  ".....XoXXoX.....",
  ".....XXXXXX.....",
  "......XXXX......",
  "...XXXXXXXXXX...",
  "..XXXXXXXXXXXX..",
  "..XX.XXXXXX.XX..",
  "..XX.XXXXXX.XX..",
  ".....XXXXXX.....",
  ".....XXXXXX.....",
  ".....XX..XX.....",
  ".....XX..XX.....",
  ".....XX..XX.....",
  "....XXX..XXX....",
  "................",
];
const GEM = [
  "................",
  "................",
  "....XXXXXXXX....",
  "...XooXXXXXXX...",
  "..XooXXXXXXXXX..",
  ".XXXXXXXXXXXXXX.",
  "..XXXXXXXXXXXX..",
  "...XXXXXXXXXX...",
  "....XXXXXXXX....",
  ".....XXXXXX.....",
  "......XXXX......",
  ".......XX.......",
  "................",
  "................",
  "................",
  "................",
];
/** @type {Record<string, number[]>} */
const FIGURE_COLORS = { X: [40, 90, 220, 255], o: [255, 255, 255, 255], ".": [0, 0, 0, 0] };
/** @type {Record<string, number[]>} */
const GEM_COLORS = { X: [240, 190, 20, 255], o: [255, 250, 210, 255], ".": [0, 0, 0, 0] };

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** The PNG's bytes. */
export function spriteSheet() {
  const w = 32, h = 16;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) {
      const [pic, colors] = x < 16 ? [FIGURE, FIGURE_COLORS] : [GEM, GEM_COLORS];
      row.push(...colors[pic[y][x % 16]]);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

const out = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href ? process.argv[2] : undefined;
if (out) { writeFileSync(out, spriteSheet()); console.log(`wrote ${out}`); }
