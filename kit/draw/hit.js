// Picking in 2-D (project/2026-11-27-controls-draft.md, requirement 6): which op of a draw list is under a point, in
// the list's own frame, topmost first. Exact per kind: a rect's box (a negative size spans backwards), an ellipse's
// equation, a line's distance to its segments within width / 2 (and the inside of a closed, filled one), and the
// boxes of image, tiles and text. A 3-D Dialect asks its own scene: the kit delivers the point. No Node built-ins.

import { opBox } from "./ops.js";

/** @typedef {import("./ops.js").Op} Op */
/** @typedef {import("./ops.js").Image} Image */

/** The distance from p to the segment a–b. @param {number[]} p @param {number[]} a @param {number[]} b */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Whether p is inside the polygon (even-odd). @param {number[]} p @param {number[][]} pts */
function inside(p, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Whether one op covers a point of its frame.
 * @param {any} op @param {number[]} p @param {Record<string, Image>} images
 */
export function covers(op, p, images) {
  switch (op.op) {
    case "rect": {
      const x0 = Math.min(op.at[0], op.at[0] + op.size[0]), x1 = Math.max(op.at[0], op.at[0] + op.size[0]);
      const y0 = Math.min(op.at[1], op.at[1] + op.size[1]), y1 = Math.max(op.at[1], op.at[1] + op.size[1]);
      return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    }
    case "ellipse": {
      const rx = Math.abs(op.r[0]), ry = Math.abs(op.r[1]);
      if (rx === 0 || ry === 0) return false;
      const u = (p[0] - op.at[0]) / rx, v = (p[1] - op.at[1]) / ry;
      return u * u + v * v <= 1;
    }
    case "line": {
      const pts = /** @type {number[][]} */ (op.points);
      const half = op.width / 2;
      for (let i = 1; i < pts.length; i++) if (segmentDistance(p, pts[i - 1], pts[i]) <= half) return true;
      if (op.closed && pts.length > 2 && segmentDistance(p, pts[pts.length - 1], pts[0]) <= half) return true;
      return !!(op.closed && op.fill && inside(p, pts));
    }
    default: {
      const box = opBox(op, images);
      return !!box && p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] && p[1] <= box.max[1];
    }
  }
}

/**
 * Every op under a point, topmost first, each with its index in the list.
 * @param {readonly Op[]} list @param {number[]} point @param {Record<string, Image>} images
 * @returns {Array<{ op: Op, index: number }>}
 */
export function hitsAt(list, point, images) {
  /** @type {Array<{ op: Op, index: number }>} */
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) if (covers(list[i], point, images)) out.push({ op: list[i], index: i });
  return out;
}

/**
 * The topmost op under a point, or null.
 * @param {readonly Op[]} list @param {number[]} point @param {Record<string, Image>} images
 * @returns {Op | null}
 */
export const hitTest = (list, point, images) => hitsAt(list, point, images)[0]?.op ?? null;
