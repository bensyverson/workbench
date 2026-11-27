// Grips (project/2026-11-27-controls-draft.md, requirement 7): a drag's value from the value at the down and the
// pointer's path, by the Grip's kind, then clamped to the target's own bounds (the Grammar's shape, or the param's
// min and max) and rounded: to a whole number when the shape is whole, to the Grip's step (Alt suspends it), else to the
// digits a double holds, so no float noise reaches the preview or the text (round.js). Pure.

import { roundNumber } from "./round.js";

/**
 * @typedef {object} Drag
 * @property {"translate" | "length" | "rotate" | "scale"} kind
 * @property {number | number[]} v0  the value at the down (two numbers for translate)
 * @property {number[]} p0  where the drag began, in the stage's frame
 * @property {number[]} p  where the pointer is now
 * @property {number[]} [axis]  length: where one unit of the value moves the Grip
 * @property {number[]} [center]  rotate and scale
 * @property {"deg" | "rad"} [unit]  rotate (default deg)
 * @property {number} [step]  the value rounds to it
 * @property {number} [min] @property {number} [max] @property {boolean} [whole]  the target's bounds
 * @property {boolean} [alt]  Alt held: the step is suspended
 */

/** @param {number[]} a @param {number[]} b */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
/** @param {number[]} a @param {number[]} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/**
 * The value a drag gives.
 * @param {Drag} d @returns {number | number[]}
 */
export function gripValue(d) {
  const delta = sub(d.p, d.p0);
  /** @param {number} v */
  const bound = (v) => {
    let x = v;
    if (typeof d.min === "number") x = Math.max(d.min, x);
    if (typeof d.max === "number") x = Math.min(d.max, x);
    if (d.whole) return Math.round(x);
    return roundNumber(x, d.step && !d.alt ? d.step : undefined, { min: d.min, max: d.max });
  };
  switch (d.kind) {
    case "translate": {
      const v = /** @type {number[]} */ (d.v0);
      return [bound(v[0] + delta[0]), bound(v[1] + delta[1])];
    }
    case "length": {
      const a = /** @type {number[]} */ (d.axis);
      return bound(/** @type {number} */ (d.v0) + dot(delta, a) / dot(a, a));
    }
    case "rotate": {
      const c = /** @type {number[]} */ (d.center);
      const a = sub(d.p0, c), b = sub(d.p, c);
      const angle = Math.atan2(a[0] * b[1] - a[1] * b[0], dot(a, b));
      return bound(/** @type {number} */ (d.v0) + (d.unit === "rad" ? angle : (angle * 180) / Math.PI));
    }
    case "scale": {
      const c = /** @type {number[]} */ (d.center);
      const r0 = Math.hypot(...sub(d.p0, c));
      return bound(r0 === 0 ? /** @type {number} */ (d.v0) : /** @type {number} */ (d.v0) * (Math.hypot(...sub(d.p, c)) / r0));
    }
  }
  throw new TypeError(`gripValue: ${d.kind} is not a Grip kind`);
}
