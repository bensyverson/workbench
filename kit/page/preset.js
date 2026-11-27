// One package example run alone: a one-part composition, shown on the page. The example is a Program file's
// default export, `($) => <builder chain>`, built through kit/define's `run`, so a build-time read of `$` gets the
// param's declared value and is recorded in the record's `reads`; the composed part carries that record, so kit/run
// knows which param edits rebuild the part, and `build` is the rebuild it calls (the example run again with the
// new values). No DOM, no Node built-ins: importing the example is the host's.

import { run } from "../define/index.js";
import { compose, page, PAGE, PAGE_CONTROLS } from "../compose/index.js";
import { programOf } from "../define/grammar.js";
import { parseSeam, compareSeams } from "../seam/index.js";

/** @import { BuildOptions } from "../define/define.js" */

/**
 * A preset, or why there is none. `composition` delegates to kit/compose's (`check`, `plan`, `build`, each with the
 * preset's own build options); its built record's part carries `run`'s record. `build(part, params)` is createRun's
 * rebuild. `diagnostics` are the example's B codes when its Program does not build, or H005.
 * @typedef {{ composition: { check: (o?: Record<string, any>) => any[], plan: (o?: Record<string, any>) => string[], build: (o?: Record<string, any>) => any } | null, build: ((part: string, params: Record<string, unknown>) => Record<string, any>) | null, diagnostics: Array<{ code: string, severity?: string, message: string }> }} Preset
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Which page control goes to which of the part's Event inputs (Ben's ruling 1, 2026-11-27: a part takes a control as an
 * Event input with its seam). A control is wired to the input whose seam is exactly its own; when two inputs are, or one
 * input fits several controls, none of those is wired and `ambiguous` says so, for the host to show as H009.
 * @param {any} chain  the example's builder chain @returns {{ wires: Array<[string, string]>, ambiguous: string[] }}
 */
function controlWires(chain) {
  /** @type {Record<string, any>} */
  const ins = programOf(chain)?.g?.dialect?.seams?.in ?? {};
  const events = Object.entries(ins).filter(([, i]) => i.seam.kind === "event");
  /** @type {Map<string, string[]>} control → the inputs taking it */
  const takes = new Map();
  for (const [control, text] of Object.entries(PAGE_CONTROLS)) {
    const from = /** @type {any} */ (parseSeam(text)).type;
    const hit = events.filter(([, i]) => { const c = compareSeams(from, i.seam); return !c.problems.length && !c.dropped.length && !Object.keys(c.filled).length; }).map(([n]) => n);
    if (hit.length) takes.set(control, hit);
  }
  /** @type {Map<string, string[]>} input → the controls it fits */
  const fits = new Map();
  for (const [control, hit] of takes) for (const n of hit) fits.set(n, [...(fits.get(n) ?? []), control]);
  /** @type {Array<[string, string]>} */
  const wires = [];
  /** @type {string[]} */
  const ambiguous = [];
  for (const [control, hit] of takes) {
    if (hit.length === 1 && fits.get(hit[0])?.length === 1) wires.push([control, hit[0]]);
    else if (hit.length > 1) ambiguous.push(`page.out.${control} fits ${hit.map((n) => `in.${n}`).join(" and ")}`);
  }
  for (const [n, controls] of fits) if (controls.length > 1) ambiguous.push(`in.${n} fits the controls ${controls.join(", ")}`);
  return { wires, ambiguous };
}

/** @param {string} message @returns {Preset} */
const refused = (message) => ({ composition: null, build: null, diagnostics: [{ code: "H005", severity: "error", message }] });

/**
 * Composes one example alone, named `name` (kit/compose's composition name: lowercase letters, digits and `-`).
 * @param {string} name  the composition's name: the package's, say
 * @param {unknown} programFn  the example's default export
 * @param {BuildOptions} [build]  the example's module scope (kit/define's `moduleScope`)
 * @param {{ wirePage?: boolean }} [options]  `wirePage: false` leaves the page unwired, as a test's run needs (its records go in by `in`)
 * @returns {Preset}
 */
export function examplePreset(name, programFn, build = {}, { wirePage = true } = {}) {
  if (typeof programFn !== "function") return refused(`the example's default export is ${programFn === undefined ? "missing" : `not a function but ${typeof programFn}`}: an example is export default ($) => <builder chain>`);
  const fn = /** @type {(params: any) => unknown} */ (programFn);
  // the Program's own function is not one of its helpers, though the file may declare it at the top level
  const options = build.scope ? { ...build, scope: Object.fromEntries(Object.entries(build.scope).filter(([, v]) => v !== fn)) } : build;
  /** @type {any} */
  let chain = null;
  /** @type {ReturnType<typeof run>} */
  let built;
  try { built = run(($) => (chain = fn($)), options); } catch (e) { return refused(`the example did not make a Program: ${messageOf(e)}`); }
  if (!built.record) return { composition: null, build: null, diagnostics: built.diagnostics };
  const record = built.record;
  const { wires, ambiguous } = wirePage ? controlWires(chain) : { wires: [], ambiguous: [] };
  const base = wires.reduce((c, [control, input]) => c.wire(/** @type {any} */ (page.out)[control], chain.in[input]), compose(name).part(chain).show(chain));
  const notes = ambiguous.length ? [{ code: "H009", severity: "warning", message: `the page's controls are not wired to this part, because ${ambiguous.join("; ")}: one control goes to one Event input, and one input takes one control; a glue chooses` }] : [];
  /** @param {Record<string, any>} [o] */
  const own = (o = {}) => ({ ...o, build: options });
  return {
    composition: {
      check: (o) => base.check(own(o)),
      plan: (o) => base.plan(own(o)),
      build: (o) => {
        const composed = base.build(own(o));
        // the one part (the page, when a control is wired to it, keeps its own), with the record run built: the same Program, with its build-time reads
        return { ...composed, parts: composed.parts.map((/** @type {any} */ p) => (p.dialect === PAGE ? p : { ...p, record })) };
      },
    },
    build(_part, params) {
      const again = run(fn, { ...options, values: params });
      if (!again.record) throw new Error(`the example did not build with ${JSON.stringify(params)}: ${again.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`);
      return again.record;
    },
    diagnostics: [...built.diagnostics, ...notes],
  };
}
