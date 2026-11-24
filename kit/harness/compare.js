// Comparing two evaluators' pixels: the worst difference, where it is, and how many components exceed a tolerance.

/**
 * What the buffers are: a grid and the label of each set (one buffer per set; three floats per pixel, rgb,
 * row 0 at the bottom, pixel `(j * width + i) * 3`).
 * @typedef {{ width: number, height: number, labels: string[] }} Shape
 */

/**
 * One component that differs.
 * @typedef {object} Worst
 * @property {number} diff  Absolute difference; Infinity when either side is not a number.
 * @property {number} set  Index of the param set.
 * @property {[number, number]} pixel  Column, and row counted from the bottom.
 * @property {number} channel  0 red, 1 green, 2 blue.
 * @property {number} ref
 * @property {number} got
 */

/**
 * @typedef {object} Comparison
 * @property {boolean} exact  Every component identical (`Object.is`), so -0 differs from 0.
 * @property {Worst} worst  The largest difference (the first, when several tie); the first component of the first set when exact.
 * @property {number} over  Components whose difference exceeds the tolerance.
 * @property {number} components  Components compared.
 * @property {Array<{ worst: number, over: number }>} sets  The same, per set.
 */

/**
 * The rgb of an RGBA readback, checking the alpha the shader wrote is 1.
 * @param {Float32Array} rgba
 * @returns {Float32Array}
 */
export function rgbOf(rgba) {
  const out = new Float32Array((rgba.length / 4) * 3);
  for (let p = 0; p < rgba.length / 4; p++) {
    if (rgba[p * 4 + 3] !== 1) throw new Error(`pixel ${p} has alpha ${rgba[p * 4 + 3]}, not 1`);
    out[p * 3] = rgba[p * 4];
    out[p * 3 + 1] = rgba[p * 4 + 1];
    out[p * 3 + 2] = rgba[p * 4 + 2];
  }
  return out;
}

/**
 * Compares `got` with the reference `ref`, set by set.
 * @param {Float32Array[]} ref
 * @param {Float32Array[]} got
 * @param {Shape} shape
 * @param {number} tolerance  A component differs when its absolute difference exceeds this; 0 also demands identical bits.
 * @returns {Comparison}
 */
export function compare(ref, got, shape, tolerance) {
  if (Number.isNaN(tolerance) || tolerance < 0) throw new Error(`the tolerance must be a number of at least 0, got ${tolerance}`);
  const size = shape.width * shape.height * 3;
  if (ref.length !== shape.labels.length || got.length !== shape.labels.length) throw new Error(`expected ${shape.labels.length} sets, got ${ref.length} and ${got.length}`);
  /** @type {Worst} */
  let worst = { diff: 0, set: 0, pixel: [0, 0], channel: 0, ref: ref[0][0], got: got[0][0] };
  let exact = true, over = 0;
  /** The first component that is not identical, kept for a mismatch whose difference is 0 (-0 against +0). @type {Worst | null} */
  let first = null;
  /** @type {Comparison["sets"]} */
  const sets = [];
  for (let s = 0; s < ref.length; s++) {
    if (ref[s].length !== size || got[s].length !== size) throw new Error(`set ${s} has the wrong size: ${ref[s].length} and ${got[s].length}, expected ${size}`);
    let setWorst = 0, setOver = 0;
    for (let c = 0; c < size; c++) {
      const a = ref[s][c], b = got[s][c];
      if (!Object.is(a, b)) {
        exact = false;
        if (!first) { const p = Math.floor(c / 3); first = { diff: 0, set: s, pixel: [p % shape.width, Math.floor(p / shape.width)], channel: c % 3, ref: a, got: b }; }
      }
      const diff = Object.is(a, b) ? 0 : Number.isNaN(a) || Number.isNaN(b) ? Infinity : Math.abs(a - b);
      if (diff > tolerance) { over++; setOver++; }
      if (diff > setWorst) setWorst = diff;
      if (diff > worst.diff) {
        const p = Math.floor(c / 3);
        worst = { diff, set: s, pixel: [p % shape.width, Math.floor(p / shape.width)], channel: c % 3, ref: a, got: b };
      }
    }
    sets.push({ worst: setWorst, over: setOver });
  }
  if (first && worst.diff === 0) worst = first;
  return { exact, worst, over, components: size * ref.length, sets };
}
