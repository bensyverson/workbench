// Painter's order on the Game Boy (DMG). Hardware draws every sprite (an OAM object) above the background and window,
// and among overlapping objects the one with the smaller x on top, a tie going to the earlier OAM entry. A draw list
// means "later covers earlier", so a list is drawable exactly only when the two orders agree wherever ops overlap.
// The sprite's BG-priority bit is not modeled: the op set cannot express it.

/** @typedef {{ i: number, x: number, y: number }} GbObject  an 8 by 8 sprite, drawn by op `i`, at its top-left */
/** @typedef {{ i: number, cells: number[][] }} GbGrid  the top-left corners of the cells op `i` draws */

/** Whether two 8-unit squares share an on-screen area. @param {number[]} a @param {number[]} b @param {number} t @param {{ min: number[], max: number[] }} box */
function meet(a, b, t, box) {
  const x0 = Math.max(a[0], b[0], box.min[0]), x1 = Math.min(a[0], b[0]) + t;
  const y0 = Math.max(a[1], b[1], box.min[1]), y1 = Math.min(a[1], b[1]) + t;
  return x0 < Math.min(x1, box.max[0]) && y0 < Math.min(y1, box.max[1]);
}

/**
 * The orders the Game Boy would not reproduce, as [code, message]: a tiles op listed after a sprite it overlaps
 * (J043), and a sprite listed after one it overlaps unless its x is smaller (J044). One entry per pair of ops.
 * @param {{ tile: number }} gb @param {{ min: number[], max: number[] }} box @param {GbObject[]} objects @param {GbGrid[]} grids
 * @returns {Array<[string, string]>}
 */
export function orderProblems(gb, box, objects, grids) {
  /** @type {Array<[string, string]>} */
  const out = [];
  for (const g of grids) {
    const seen = new Set();
    for (const o of objects) {
      if (o.i > g.i || seen.has(o.i) || !g.cells.some((c) => meet([o.x, o.y], c, gb.tile, box))) continue;
      seen.add(o.i);
      out.push(["J043", `op ${g.i}: tiles drawn over op ${o.i}, but the Game Boy draws every sprite above the background and window (list the tiles first)`]);
    }
  }
  const seen = new Set();
  objects.forEach((later, k) => {
    for (const earlier of objects.slice(0, k)) {
      const key = `${earlier.i},${later.i}`;
      if (earlier.i === later.i || seen.has(key) || later.x < earlier.x || !meet([earlier.x, earlier.y], [later.x, later.y], gb.tile, box)) continue;
      seen.add(key);
      out.push(["J044", `op ${later.i} is drawn over op ${earlier.i}, but at x ${later.x} against ${earlier.x}: the Game Boy shows the smaller x on top (a tie, the earlier op)`]);
    }
  });
  return out;
}
