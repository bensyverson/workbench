// A `runs` tile's chart (kit/define's defineUI): `steps` fresh runs of the composition with one part's param spread
// evenly from `from` to `to`, both ends included, each value clamped to the param's range as an edit is; each run is
// `seconds` of run time, and `y` is read from the part's last state through the UI's compiled Kernels, with `$` that
// run's params. A param build-time code reads is swept by building the part again for each value (`build`, the
// rebuild createRun takes). No DOM, no Node built-ins.

import { createRun } from "../run/index.js";
import { needsRebuild } from "../define/index.js";

/** @import { UICompiled } from "../define/ui/compile.js" */

/**
 * @typedef {object} SweepOptions
 * @property {any} composed  kit/compose's built record
 * @property {any[]} runtimes
 * @property {any[]} [packages]  kit/package's loadPackage results, as createRun takes them
 * @property {string} part  the part whose param is swept
 * @property {{ param: string, from: number, to: number, steps: number, seconds: number, y: string }} spec  the evaluated `runs` component (`y` is its id)
 * @property {UICompiled} compiled  the part's UI, compiled against its record
 * @property {(part: string, params: Record<string, unknown>) => Record<string, any>} [build]  the part's rebuild, for a build-time param
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * The sweep's points, or why it has none (or stopped): never a throw.
 * @param {SweepOptions} o
 * @returns {{ points: { x: number, y: number }[], error?: string }}
 */
export function sweepRuns({ composed, runtimes, packages, part, spec, compiled, build }) {
  const cp = composed.parts.find((/** @type {any} */ p) => p.name === part);
  if (!cp) return { points: [], error: `the composition has no part '${part}'` };
  const decl = cp.record.params?.[spec.param];
  if (!decl) return { points: [], error: `part '${part}' has no param '${spec.param}' to sweep` };
  const atBuild = needsRebuild(cp.record, [spec.param]);
  if (atBuild && !build) return { points: [], error: `the param ${part}.$.${spec.param} is read at build time, so each run builds the part again, and the sweep was given no build(part, params)` };
  /** @type {Record<string, unknown>} */
  const declared = Object.fromEntries(Object.entries(/** @type {Record<string, any>} */ (cp.record.params)).map(([n, d]) => [n, d.value]));
  const points = [];
  for (let i = 0; i < spec.steps; i++) {
    const raw = spec.from + ((spec.to - spec.from) * i) / (spec.steps - 1);
    const x = Math.min(decl.max ?? raw, Math.max(decl.min ?? raw, raw));
    const $ = { ...declared, [spec.param]: x };
    try {
      const record = atBuild && build ? build(part, $) : cp.record;
      const swept = record === cp.record ? composed : { ...composed, parts: composed.parts.map((/** @type {any} */ p) => (p.name === part ? { ...p, record } : p)) };
      const run = createRun(swept, { runtimes, ...(packages ? { packages } : {}), params: { [part]: { [spec.param]: x } }, ...(build ? { build } : {}) });
      run.runUntil(spec.seconds);
      points.push({ x, y: Number(compiled.value(spec.y, run.state(part), $)) });
    } catch (e) {
      return { points, error: `the run with ${spec.param} = ${x} failed: ${messageOf(e)}` };
    }
  }
  return { points };
}
