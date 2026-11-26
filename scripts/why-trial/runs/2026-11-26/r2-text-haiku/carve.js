// Build-time level generation for the cave: plain JavaScript, run once per build. Row 2 is always a corridor from
// the start (x = 1 or 2) to the exit, so a miner holding right reaches the exit; the rest is rock or floor by a hash.

const W = 14, H = 5;

/** A hash of three integers into [0, 1). @param {number} a @param {number} b @param {number} c */
function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The level for a seed, a depth and a roughness in percent (the share of rock off the corridor, to the nearest 10).
 * @param {number} seed @param {number} depth @param {number} roughness
 */
export function carve(seed, depth, roughness) {
  const rock = Math.round(roughness / 10) / 10;
  const start = { x: 1 + (depth % 2), y: 2 };
  const exit = { x: 4 + ((seed * 7 + depth * 5) % 9), y: 2 };
  const grid = [];
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const corridor = y === 2 && x >= start.x && x <= exit.x;
      row += edge ? "#" : corridor ? "." : hash(x + seed, y + depth * 31, seed) < rock ? "#" : ".";
    }
    grid.push(row);
  }
  return { grid, start, exit };
}
