// A `runs` tile's chart (kit/define's defineUI): `steps` fresh runs of the composition with one part's param spread
// evenly from `from` to `to`, both ends included, each value clamped to the param's range (an edit is not clamped:
// kit/run refuses a param input outside the range, N008); each run is `seconds` of run time, and `y` is read from
// the part's last state through the UI's compiled Kernels, with `$` that run's params. A param build-time code
// reads is swept by building the part again for each value (`build`, the rebuild createRun takes). A sweep at
// defineUI's limits is minutes of work, so it runs in slices and yields between them (review M3): the page stays
// live, shows the progress, and can cancel. No DOM, no Node built-ins.

import { createRun } from "../run/index.js";
import { needsRebuild } from "../define/index.js";

/** @import { UICompiled } from "../define/ui/compile.js" */

/** Run time between checks of the wall-time budget, in seconds: a tick's work at most, never a whole run. */
const SLICE = 1 / 4;
/** Wall time a sweep holds the thread between yields, in ms, by default: under one display frame. */
const BUDGET_MS = 12;

/**
 * @typedef {object} SweepOptions
 * @property {any} composed  kit/compose's built record
 * @property {any[]} runtimes
 * @property {any[]} [packages]  kit/package's loadPackage results, as createRun takes them
 * @property {string} part  the part whose param is swept
 * @property {{ param: string, from: number, to: number, steps: number, seconds: number, y: string }} spec  the evaluated `runs` component (`y` is its id)
 * @property {UICompiled} compiled  the part's UI, compiled against its record
 * @property {(part: string, params: Record<string, unknown>) => Record<string, any>} [build]  the part's rebuild, for a build-time param
 * @property {AbortSignal} [signal]  stops the sweep at its next yield: the points so far, `cancelled`
 * @property {(fraction: number) => void} [onProgress]  the share of the sweep's run time done, 0..1, at each yield and at the end
 * @property {number} [budgetMs]  wall time held between yields (default 12 ms)
 * @property {() => Promise<void>} [yieldFn]  how to give the thread back (default a zero-delay timer, so a page paints and takes input)
 */

/** @typedef {{ points: { x: number, y: number }[], error?: string, cancelled?: true }} Sweep */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The sweep's points, or why it has none (or stopped): never a rejection.
 * @param {SweepOptions} o
 * @returns {Promise<Sweep>}
 */
export async function sweepRuns({ composed, runtimes, packages, part, spec, compiled, build, signal, onProgress, budgetMs = BUDGET_MS, yieldFn = nextTask }) {
  const cp = composed.parts.find((/** @type {any} */ p) => p.name === part);
  if (!cp) return { points: [], error: `the composition has no part '${part}'` };
  const decl = cp.record.params?.[spec.param];
  if (!decl) return { points: [], error: `part '${part}' has no param '${spec.param}' to sweep` };
  const atBuild = needsRebuild(cp.record, [spec.param]);
  if (atBuild && !build) return { points: [], error: `the param ${part}.$.${spec.param} is read at build time, so each run builds the part again, and the sweep was given no build(part, params)` };
  /** @type {Record<string, unknown>} */
  const declared = Object.fromEntries(Object.entries(/** @type {Record<string, any>} */ (cp.record.params)).map(([n, d]) => [n, d.value]));
  /** @type {Sweep["points"]} */
  const points = [];
  if (signal?.aborted) return { points, cancelled: true };
  const total = spec.steps * spec.seconds;
  let held = Date.now();
  /** Gives the thread back once the budget is spent; true when the sweep was cancelled meanwhile. @param {number} done */
  const pause = async (done) => {
    if (Date.now() - held < budgetMs) return false;
    onProgress?.(total > 0 ? Math.min(1, done / total) : 1);
    await yieldFn();
    held = Date.now();
    return signal?.aborted ?? false;
  };
  for (let i = 0; i < spec.steps; i++) {
    const raw = spec.from + ((spec.to - spec.from) * i) / (spec.steps - 1);
    const x = Math.min(decl.max ?? raw, Math.max(decl.min ?? raw, raw));
    const $ = { ...declared, [spec.param]: x };
    try {
      const record = atBuild && build ? build(part, $) : cp.record;
      const swept = record === cp.record ? composed : { ...composed, parts: composed.parts.map((/** @type {any} */ p) => (p.name === part ? { ...p, record } : p)) };
      const run = createRun(swept, { runtimes, ...(packages ? { packages } : {}), params: { [part]: { [spec.param]: x } }, ...(build ? { build } : {}) });
      // a run is the same however runUntil is chunked (kit/run), so the slices change no point
      for (let k = 1; k * SLICE < spec.seconds; k++) {
        run.runUntil(k * SLICE);
        if (await pause(i * spec.seconds + k * SLICE)) return { points, cancelled: true };
      }
      run.runUntil(spec.seconds);
      points.push({ x, y: Number(compiled.value(spec.y, run.state(part), $)) });
    } catch (e) {
      return { points, error: `the run with ${spec.param} = ${x} failed: ${messageOf(e)}` };
    }
    if (await pause((i + 1) * spec.seconds)) return { points, cancelled: true };
  }
  onProgress?.(1);
  return { points };
}
