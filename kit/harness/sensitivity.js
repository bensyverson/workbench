// Planted-fault sensitivity: each fault of `FAULTS` is planted in one backend and run through the harness. A
// fault is caught when the pair that holds the faulty backend differs from the interpreter: bit for bit for JS,
// beyond the tolerance for GLSL. The faults that escape are the evidence of what the harness cannot see.

import { standardCases } from "./cases.js";
import { prepare } from "./pipeline.js";
import { referencePixels, compareJs, compareGlsl, shaderJob } from "./run.js";
import { FAULTS } from "./faults.js";
import { figureFor, glslFigure } from "./target.js";

/**
 * The scale the faults run at: a 74-pixel panel and a 65 by 44 warp, a fraction of the standard grids so that dozens
 * of shaders fit one sleepy call. 74, not 75: at 75 pixels a center `(i + 0.5) * 150 / 75` is a whole number, which
 * lands exactly on the swirl grid's thresholds (`pmod(x, 10) < 1`), where the GPU and the interpreter may fall on
 * different sides and differ by a whole color; no pixel of a 74-pixel panel is on a threshold.
 */
export const FAULT_SCALE = 0.49;

/** @import { Fault } from "./faults.js" */
/** @import { Render, PairResult } from "./run.js" */

/**
 * @typedef {object} FaultRow
 * @property {string} id
 * @property {Fault["kind"]} kind
 * @property {"js" | "glsl"} target
 * @property {string} what
 * @property {string} case
 * @property {boolean} planted  False when the edit changed nothing of its target: no evidence either way.
 * @property {string[]} sites  The source text of the IR nodes the fault edited.
 * @property {boolean | null} caught  Null when it could not run (see `error`).
 * @property {number | null} worst  The largest difference seen, over all of the case's sets.
 * @property {string | null} at  Where the worst difference came from, as `kernel line N: text`.
 * @property {string | null} error  Why a shader did not run.
 * @property {string | null} escape  The reason the fault is expected to escape, when it is.
 */

/**
 * @typedef {object} FaultsResult
 * @property {FaultRow[]} rows
 * @property {Array<{ case: string, jsExact: boolean, glslWorst: number | null, tolerance?: number }>} controls  `tolerance`: the figure the control's case was held to.
 * @property {number} tolerance  The target's declared figure (or the caller's), for a control that carries none.
 * @property {Array<{ case: string, figure: number, reason: string, held: number }>} overrides  The cases that overrode the figure, each with its reason; `held` is the figure the case was held to, which is not `figure` when the caller's `tolerance` replaced it.
 */

/**
 * @param {PairResult} pair
 * @returns {string | null}
 */
function where(pair) {
  return pair.at ? `${pair.at.kernel} line ${pair.at.line}: ${pair.at.text}` : null;
}

/**
 * What is wrong with a `runFaults` result, one line each; empty when the run is a clean verdict: every control
 * clean, every fault planted and compared, every escape explained.
 * A control held to an overriding figure says so, with the reason.
 * @param {FaultsResult} result
 * @returns {string[]}
 */
export function faultProblems(result) {
  const out = [];
  for (const c of result.controls) {
    if (!c.jsExact) out.push(`control ${c.case}: JS differs from the interpreter with no fault planted`);
    const figure = c.tolerance ?? result.tolerance;
    // Two cases may share a name: prefer the override whose held figure is this control's.
    const override = result.overrides.find((o) => o.case === c.case && o.held === figure) ?? result.overrides.find((o) => o.case === c.case);
    const why = !override ? "" : override.held === override.figure ? `; held to ${figure} (override: ${override.reason})` : `; held to ${figure} (the caller's tolerance; the case's override is ${override.figure}: ${override.reason})`;
    if (c.glslWorst !== null && !(c.glslWorst <= figure)) out.push(`control ${c.case}: GLSL differs by ${c.glslWorst} with no fault planted${why}`);
  }
  for (const r of result.rows) {
    if (!r.planted) out.push(`not planted: ${r.id} (${r.target})`);
    else if (r.error) out.push(`${r.id} (${r.target}): shader error: ${r.error.slice(0, 160)}`);
    else if (r.caught === false && !r.escape) out.push(`unexplained escape: ${r.id} (${r.target})`);
    else if (r.caught === true && r.escape) out.push(`escape claimed but caught: ${r.id} (${r.target})`);
  }
  return out;
}

/**
 * Plants every fault in every backend it applies to. JS faults run here; GLSL faults need `render` and are skipped
 * (with `caught: null`) when there is none.
 * @param {{ render?: Render, scale?: number, tolerance?: number, faults?: Fault[], cases?: import("./cases.js").Case[] }} [options]  `tolerance` is the caller's figure for every case; `cases` replaces the standard cases (an override with no reason is refused).
 * @returns {Promise<FaultsResult>}
 */
export async function runFaults(options = {}) {
  const cases = options.cases ?? standardCases(options.scale ?? FAULT_SCALE);
  // Keyed by the case object: two cases may share a name and have different overrides.
  const figures = new Map(cases.map((c) => [c, figureFor(c)]));
  const toleranceOf = (/** @type {import("./cases.js").Case} */ c) => options.tolerance ?? /** @type {{ figure: number }} */ (figures.get(c)).figure;
  const overrides = cases.flatMap((c) => { const o = figures.get(c)?.override; return o ? [{ case: c.name, figure: o.figure, reason: o.reason, held: toleranceOf(c) }] : []; });
  const faults = options.faults ?? FAULTS;
  /** @type {Map<import("./cases.js").Case, Float32Array[]>} */
  const refs = new Map();
  const refOf = (/** @type {import("./cases.js").Case} */ c) => {
    let r = refs.get(c);
    if (!r) refs.set(c, (r = referencePixels(prepare(c.program), c)));
    return r;
  };

  /** @type {FaultRow[]} */
  const rows = [];
  /** @type {Array<{ row: FaultRow, p: ReturnType<typeof prepare>, c: import("./cases.js").Case, job: import("./gl.js").ShaderJob }>} */
  const pending = [];
  for (const f of faults) {
    const c = /** @type {import("./cases.js").Case} */ (cases.find((x) => x.name === f.case));
    for (const target of f.targets) {
      const plant = f.make(target);
      const p = prepare(c.program, plant);
      /** @type {FaultRow} */
      const row = { id: f.id, kind: f.kind, target, what: f.what, case: c.name, planted: p.planted, sites: plant.sites ?? [], caught: null, worst: null, at: null, error: null, escape: f.escapes?.[target] ?? null };
      rows.push(row);
      if (!p.planted) continue;
      if (target === "js") {
        const { pair } = compareJs(p, c, refOf(c));
        Object.assign(row, { caught: !pair.exact, worst: pair.worst.diff, at: where(pair) });
      } else if (options.render) pending.push({ row, p, c, job: shaderJob(p, c, f.id) });
    }
  }
  if (pending.length && options.render) {
    const results = await options.render(pending.map((x) => x.job));
    pending.forEach((x, i) => {
      const r = results[i];
      // A shader that does not compile was never compared, so it is neither caught nor escaped.
      if (r.error) { x.row.error = r.error; return; }
      const { pair } = compareGlsl(x.p, x.c, refOf(x.c), r.sets, toleranceOf(x.c));
      Object.assign(x.row, { caught: pair.over > 0, worst: pair.worst.diff, at: where(pair) });
    });
  }

  /** The unplanted pipelines, which must come out clean. */
  const controls = [];
  for (const c of cases) {
    const p = prepare(c.program);
    const ref = refOf(c);
    const jsExact = compareJs(p, c, ref).pair.exact;
    let glslWorst = null;
    if (options.render) {
      const [r] = await options.render([shaderJob(p, c, `control ${c.name}`)]);
      glslWorst = r.error ? Infinity : compareGlsl(p, c, ref, r.sets, toleranceOf(c)).pair.worst.diff;
    }
    controls.push({ case: c.name, jsExact, glslWorst, tolerance: toleranceOf(c) });
  }
  return { rows, controls, tolerance: options.tolerance ?? glslFigure(), overrides };
}

/**
 * Per backend: how many planted faults ran, how many were caught, and the rest.
 * @param {FaultRow[]} rows
 * @returns {Record<"js" | "glsl", { planted: number, caught: number, escaped: FaultRow[], unplanted: FaultRow[], skipped: number }>}
 */
export function tally(rows) {
  const out = { js: { planted: 0, caught: 0, escaped: [], unplanted: [], skipped: 0 }, glsl: { planted: 0, caught: 0, escaped: [], unplanted: [], skipped: 0 } };
  for (const r of rows) {
    const t = out[r.target];
    if (!r.planted) { /** @type {FaultRow[]} */ (t.unplanted).push(r); continue; }
    if (r.caught === null) { t.skipped++; continue; }
    t.planted++;
    if (r.caught) t.caught++;
    else /** @type {FaultRow[]} */ (t.escaped).push(r);
  }
  return out;
}
