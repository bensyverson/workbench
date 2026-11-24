// The grids and param sets the harness runs the two H3 sketches over.

import { swirl, bulge } from "../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../dialects/fields/programs/domain-warp.js";

/** @import { FieldProgram } from "../dialects/fields/decls.js" */

/** @typedef {Record<string, number | string | boolean>} ParamValues */

/**
 * A case's GLSL figure, when it must differ from the target's: stated with the reason, which is required.
 * @typedef {{ figure: number, reason: string }} Override
 */

/**
 * One program over one grid and several param sets.
 * @typedef {object} Case
 * @property {Override} [override]  Replaces the GLSL target's declared figure for this case; `figureFor` refuses it without a reason, and every report prints it.
 * @property {string} name
 * @property {FieldProgram} program
 * @property {number} width  Pixels across.
 * @property {number} height  Pixels up.
 * @property {Array<{ label: string, values: ParamValues }>} sets  Every uniform of the program; `aspect` is width over height.
 */

/**
 * The position of the pixel in column `i` and row `j` counted from the bottom: its center, in the unit
 * square with y up, as the shader's `gl_FragCoord.xy / resolution` is. Computed in doubles, so a
 * shader that divides in f32 may differ from it by an ulp, which is part of what the harness measures.
 * @param {number} i
 * @param {number} j
 * @param {number} width
 * @param {number} height
 * @returns {number[]}
 */
export function pixelUv(i, j, width, height) {
  return [(i + 0.5) / width, (j + 0.5) / height];
}

/**
 * The declared defaults of a program's params, with `t` and `aspect`.
 * @param {FieldProgram} program
 * @param {number} aspect
 * @returns {ParamValues}
 */
function defaults(program, aspect) {
  return { ...Object.fromEntries(Object.entries(program.params).map(([k, d]) => [k, d.value])), t: 0, aspect };
}

/**
 * The book's panel is 150 pixels, so `swirl` and `bulge` run at 150 by 150: the grid's 10-pixel lines and
 * their 1.2-pixel stripes land on the same pixels as the book's.
 * Three centers each: the default, an off-center lens with a negative or small effect, and a lens on the
 * panel's edge (cx 150, cy 0) where most of the panel is outside the lens.
 * @param {number} size
 * @returns {Case[]}
 */
function remapCases(size) {
  const base = (/** @type {FieldProgram} */ p) => defaults(p, 1);
  return [
    { name: "swirl", program: swirl, width: size, height: size, sets: [
      { label: "defaults", values: base(swirl) },
      { label: "angle -3.3, center (40.5, 99.9)", values: { ...base(swirl), angle: -3.3, cx: 40.5, cy: 99.9 } },
      { label: "angle 0.01, center (150, 0)", values: { ...base(swirl), angle: 0.01, cx: 150, cy: 0 } },
    ] },
    { name: "bulge", program: bulge, width: size, height: size, sets: [
      { label: "defaults", values: base(bulge) },
      { label: "strength 0.2, center (60.3, 80.7)", values: { ...base(bulge), strength: 0.2, cx: 60.3, cy: 80.7 } },
      { label: "strength 1, center (0, 150)", values: { ...base(bulge), strength: 1, cx: 0, cy: 150 } },
    ] },
  ];
}

/**
 * `domain-warp` over all three palettes crossed with all three levels (nine sets), each with its own `t`,
 * `seed` and `k`, at the book's 440 by 300 aspect.
 * @param {number} width
 * @param {number} height
 * @returns {Case}
 */
function warpCase(width, height) {
  const base = defaults(domainWarp, width / height);
  /** @type {Case["sets"]} */
  const sets = [];
  for (const palette of ["fog", "grey", "marble"]) for (const levels of [0, 1, 2]) {
    sets.push({ label: `${palette}, levels ${levels}`, values: { ...base, palette, levels, t: levels * 1.3, seed: 1 + levels * 7, k: 4 - levels } });
  }
  return { name: "domain-warp", program: domainWarp, width, height, sets };
}

/**
 * The recorded cases. `scale` 1 is the full run (the book's panel, and a 132 by 90 warp); a smaller one keeps
 * the aspect and shrinks both, for the fast suite.
 * @param {number} [scale]
 * @returns {Case[]}
 */
export function standardCases(scale = 1) {
  const sz = (/** @type {number} */ n) => Math.max(4, Math.round(n * scale));
  const w = sz(132);
  return [...remapCases(sz(150)), warpCase(w, Math.max(4, Math.round((w * 300) / 440)))];
}

/** @type {Override} */
const STRESS_OVERRIDE = {
  figure: 1e-2,
  reason: "worst 5.18e-3 recorded on Apple's GPU through WebKit (5.2x the target's 1e-3; 4.85e-3 on the 2026-11-24 rerun): five octaves of noise chained twice at the largest k and seed amplify an f32 rounding difference; the cause is not established (fused multiply-add on this GPU is one candidate), see project/2026-11-23-m2-findings.md",
};

/**
 * `domain-warp` pushed to the edge of its declared ranges, to see how far the shader strays when the hash and the
 * sines get large arguments: the largest `scale`, `k` and `seed`, a `t` of ten minutes, every palette, level 2.
 * Not part of the standard cases: it is how the tolerance's headroom is measured.
 * @param {number} [scale]
 * @returns {Case}
 */
export function stressCase(scale = 1) {
  const width = Math.max(4, Math.round(132 * scale)), height = Math.max(4, Math.round((width * 300) / 440));
  const base = { ...defaults(domainWarp, width / height), scale: 8, k: 8, seed: 99, levels: 2 };
  return { name: "domain-warp (stress)", program: domainWarp, width, height, override: STRESS_OVERRIDE, sets: ["fog", "grey", "marble"].flatMap((palette) => [0, 600].map((t) => ({ label: `${palette}, t ${t}, scale 8, k 8, seed 99`, values: { ...base, palette, t } }))) };
}
