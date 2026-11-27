// One package example run alone: a one-part composition, shown on the page. The example is a Program file's
// default export, `($) => <builder chain>`, built through kit/define's `run`, so a build-time read of `$` gets the
// param's declared value and is recorded in the record's `reads`; the composed part carries that record, so kit/run
// knows which param edits rebuild the part, and `build` is the rebuild it calls (the example run again with the
// new values). No DOM, no Node built-ins: importing the example is the host's.

import { run } from "../define/index.js";
import { compose, page, PAGE } from "../compose/index.js";

/** @import { BuildOptions } from "../define/define.js" */

/**
 * A preset, or why there is none. `composition` delegates to kit/compose's (`check`, `plan`, `build`, each with the
 * preset's own build options, and its UI as a package); its built record's part carries `run`'s record.
 * `build(part, params, { args })` is createRun's rebuild, and a Grip's preview (kit/define's run, `args`).
 * `diagnostics` are the example's B codes when its Program does not build, or H005.
 * @typedef {{ composition: { check: (o?: Record<string, any>) => any[], plan: (o?: Record<string, any>) => string[], build: (o?: Record<string, any>) => any } | null, build: ((part: string, params: Record<string, unknown>, more?: { args?: Record<string, unknown> }) => Record<string, any>) | null, diagnostics: Array<{ code: string, severity?: string, message: string }> }} Preset
 */

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * Each declared Control that plays an Event input, wired to that input by its name (declared Controls, 2026-11-27):
 * nothing is inferred from seams, so nothing is ambiguous. Part-local Controls and Grips need no wire.
 * @param {any} ui  what defineUI returned, or null @returns {string[]}
 */
const controlWires = (ui) => Object.entries(/** @type {Record<string, any>} */ (ui?.controls ?? {})).filter(([, c]) => !c.local).map(([n]) => n);

/** @param {string} message @returns {Preset} */
const refused = (message) => ({ composition: null, build: null, diagnostics: [{ code: "H005", severity: "error", message }] });

/**
 * Composes one example alone, named `name` (kit/compose's composition name: lowercase letters, digits and `-`).
 * @param {string} name  the composition's name: the package's, say
 * @param {unknown} programFn  the example's default export
 * @param {BuildOptions} [build]  the example's module scope (kit/define's `moduleScope`)
 * @param {{ ui?: any, wirePage?: boolean }} [options]  `ui`, what the package's defineUI returned: each of its Controls with an Event input is wired to that input by name; `wirePage: false` wires none, as a test's run needs (its records go in by `in`)
 * @returns {Preset}
 */
export function examplePreset(name, programFn, build = {}, { ui = null, wirePage = true } = {}) {
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
  const wires = wirePage ? controlWires(ui) : [];
  const base = wires.reduce((c, control) => c.wire(/** @type {any} */ (page.out)[control], chain.in[control]), compose(name).part(chain).show(chain));
  /** @param {Record<string, any>} [o] */
  const own = (o = {}) => ({ ...o, build: options, ...(ui ? { packages: [...(o.packages ?? []), { name: String(ui.package), ui }] } : {}) });
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
    build(_part, params, more = {}) {
      const again = run(fn, { ...options, values: params, ...(more.args ? { args: more.args } : {}) });
      if (!again.record) throw new Error(`the example did not build with ${JSON.stringify(params)}: ${again.diagnostics.map((d) => `${d.code} ${d.message}`).join("; ")}`);
      return again.record;
    },
    diagnostics: built.diagnostics,
  };
}
