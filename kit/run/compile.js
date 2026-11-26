// One part's build for a run: its record lowered by its Grammar, every Runtime Lambda and helper compiled through
// the JS backend, a reader for each value output, and each Draw output's builder layers, compiled like any Kernel. A Kernel reads the Dialect's globals (`$`, the inputs object,
// anything else the Dialect declares) by name; here each name is bound to a forwarding object that reads the part's
// current globals, which the scheduler sets before every init and step, so a Kernel compiled once sees each step's
// values. An Event input's record global (`record: { name, slots }`) is the exception: it is null when the runtime
// calls a Kernel without a record (ruling 6, 2026-11-26), so it is a variable in the Kernel's closure, set from the
// current globals as each call starts.

import { emitKernel, instantiate } from "../emit/js/index.js";
import { drawReader } from "./draw.js";

/** @import { Runtime } from "../define/runtime.js" */
/** @import { Emitted } from "../emit/js/emit.js" */

/**
 * A part compiled for one record. `kernels` by lambda id; `sources` their emitted text (what a build event compares),
 * each Draw builder layer's too; `outputs` a reader per value output, `(state, params, view) => value` (a Draw output's reads the lists the View holds); `draws` each
 * Draw output's max for this record and its layers' compiled Kernels, in order; `globals.current` what the
 * Kernels' global names read now; `aliases` each named call's `<instance>.<slot>.<name>` and the id it names.
 * @typedef {{ max: number, fns: Array<(...args: any[]) => unknown> }} CompiledDraw
 * @typedef {{ ok: true, kernels: Record<string, (...args: any[]) => any>, sources: Record<string, string>, aliases: Record<string, string>, outputs: Record<string, (state: any, params: any, view?: any) => unknown>, draws: Record<string, CompiledDraw>, globals: { current: Record<string, unknown> } }} Compiled
 */

/**
 * Lowers and compiles a part, or gives the lowering's errors.
 * @param {Runtime} runtime @param {Record<string, any>} record
 * @returns {Compiled | { ok: false, diagnostics: unknown[] }}
 */
export function compilePart(runtime, record) {
  const dialect = runtime.dialect;
  /** @type {any} */
  let low;
  try { low = runtime.grammar.lower(record); } catch (e) { return { ok: false, diagnostics: [{ code: "N004", message: `lowering threw: ${/** @type {Error} */ (e)?.message ?? String(e)}` }] }; }
  const errors = low.diagnostics.filter((/** @type {any} */ d) => d.severity === "error" || d.severity === undefined);
  if (errors.length) return { ok: false, diagnostics: errors };
  /** @type {Record<string, any>} */
  const intrinsics = {};
  for (const [n, i] of Object.entries(/** @type {Record<string, any>} */ (dialect.intrinsics))) if (i.js) intrinsics[n] = i;
  const globals = { current: /** @type {Record<string, unknown>} */ ({}) };
  const records = recordNames(dialect);
  const scope = globalScope(dialect, globals, records);
  /** @type {Emitted[]} */
  const helperEmits = low.helpers.filter((/** @type {any} */ h) => h.kind === "fn" && h.result?.kernel).map((/** @type {any} */ h) => emitKernel(h.result.kernel, { intrinsics }));
  const linked = helperEmits.length ? helpersWith(helperEmits, scope, records) : { fns: {}, sync: null };
  const helpers = linked.fns;
  /** @type {Compiled["kernels"]} */
  const kernels = {};
  /** @type {Record<string, string>} */
  const sources = {};
  /** @type {Record<string, string>} */
  const aliases = {};
  for (const l of low.lambdas) {
    if (!l.result.kernel) continue;
    if (l.alias) aliases[l.alias] = l.ref.id;
    const e = emitKernel(l.result.kernel, { intrinsics });
    kernels[l.ref.id] = records.length ? withRecords(e, { ...scope, ...helpers }, records, globals, linked.sync) : /** @type {any} */ (instantiate(e, { ...scope, ...helpers }));
    sources[l.ref.id] = [...e.prelude, e.source].join("\n");
  }
  /** @type {Compiled["outputs"]} */
  const outputs = {};
  for (const p of Object.values(/** @type {Record<string, any>} */ (dialect.seams.out))) {
    if (p.seam.kind === "event") continue;
    if (p.draw) { outputs[p.name] = drawReader(p.name); continue; }
    if (typeof p.from === "string") { const path = p.from.split("."); outputs[p.name] = (s) => path.reduce((/** @type {any} */ v, /** @type {string} */ k) => v?.[k], s); continue; }
    const k = low.seams?.outputs?.[p.name]?.kernel;
    if (k) outputs[p.name] = /** @type {any} */ (instantiate(emitKernel(k, { intrinsics }), helpers));
  }
  /** @type {Compiled["draws"]} */
  const draws = {};
  const lowered = /** @type {Record<string, import("../define/draw-lower.js").LoweredDraw>} */ (low.seams?.draws ?? {});
  if (Object.keys(lowered).length) {
    // the builders' Library units, linked with the globals in scope as the Program's helpers are
    const drawHelperEmits = (low.seams.drawHelpers ?? []).filter((/** @type {any} */ h) => h.kind === "fn" && h.result?.kernel).map((/** @type {any} */ h) => emitKernel(h.result.kernel, { intrinsics }));
    const drawHelpers = drawHelperEmits.length ? helpersWith(drawHelperEmits, scope, records).fns : {};
    for (const [port, d] of Object.entries(lowered)) {
      draws[port] = {
        max: d.max,
        fns: d.layers.map((l) => {
          const e = emitKernel(/** @type {any} */ (l.result.kernel), { intrinsics });
          sources[l.id] = [...e.prelude, e.source].join("\n");
          return /** @type {(...args: any[]) => unknown} */ (instantiate(e, { ...scope, ...drawHelpers }));
        }),
      };
    }
  }
  return { ok: true, kernels, sources, aliases, outputs, draws, globals };
}

/** The names an Event input's record is read by: null in a Kernel called without one. @param {any} dialect @returns {string[]} */
const recordNames = (dialect) => Object.values(/** @type {Record<string, any>} */ (dialect.seams.in)).flatMap((i) => (i.record ? [i.record.name] : []));

/**
 * Sets each record name in a closure from the current globals: the record, or null when the runtime set none.
 * @param {string[]} records @returns {string}
 */
const syncSource = (records) => `(g) => { ${records.map((n) => `${n} = g[${JSON.stringify(n)}] ?? null;`).join(" ")} }`;

/**
 * A Kernel whose closure holds the record names as variables, set as each call starts (and the helpers' too).
 * @param {Emitted} e @param {Record<string, unknown>} scope @param {string[]} records
 * @param {{ current: Record<string, unknown> }} globals @param {((g: Record<string, unknown>) => void) | null} helpersSync
 */
function withRecords(e, scope, records, globals, helpersSync) {
  const body = `"use strict";\n${e.prelude.map((p) => `${p}\n`).join("")}let ${records.join(", ")};\nreturn [(${e.source}), ${syncSource(records)}];`;
  const [k, sync] = new Function(...Object.keys(scope), body)(...Object.values(scope));
  return /** @type {(...args: any[]) => any} */ ((/** @type {any[]} */ ...args) => {
    sync(globals.current);
    helpersSync?.(globals.current);
    return k(...args);
  });
}

/**
 * The Dialect's globals as names a Kernel can read: each a forwarding object over `globals.current[name]`, but for
 * the record names, which each closure holds itself. A name the page already has (Math) is left to it unless the
 * Dialect's runtime sets it.
 * @param {any} dialect @param {{ current: Record<string, unknown> }} globals @param {string[]} records
 * @returns {Record<string, unknown>}
 */
function globalScope(dialect, globals, records) {
  const names = new Set(Object.keys(dialect.def.globals ?? {}));
  if (dialect.seams.inputs) names.add(dialect.seams.inputs.name);
  for (const n of records) names.delete(n);
  /** @type {Record<string, unknown>} */
  const scope = {};
  for (const n of names) {
    if (n in globalThis) continue;
    const target = () => {
      const v = globals.current[n];
      if (v === null || typeof v !== "object") throw new TypeError(`the global '${n}' has no value in this step: the runtime sets ctx.globals.${n} before calling a Kernel that reads it`);
      return /** @type {object} */ (v);
    };
    scope[n] = new Proxy({}, {
      get: (_t, k) => Reflect.get(target(), k),
      set: (_t, k, v) => Reflect.set(target(), k, v),
      has: (_t, k) => Reflect.has(target(), k),
    });
  }
  return scope;
}

/**
 * A program's helpers, callable by name and able to call one another, with the globals in scope, and the record
 * names as variables of their closure (`sync` sets them; null when there are none).
 * @param {Emitted[]} helpers @param {Record<string, unknown>} scope @param {string[]} records
 * @returns {{ fns: Record<string, (...args: any[]) => unknown>, sync: ((g: Record<string, unknown>) => void) | null }}
 */
function helpersWith(helpers, scope, records) {
  const prelude = [...new Set(helpers.flatMap((h) => h.prelude))];
  const vars = records.length ? `let ${records.join(", ")};\n` : "";
  const body = `"use strict";\n${prelude.join("\n")}\n${vars}${helpers.map((h) => `const ${h.name} = (${h.source});`).join("\n")}\nreturn [{ ${helpers.map((h) => h.name).join(", ")} }, ${records.length ? syncSource(records) : "null"}];`;
  const [fns, sync] = new Function(...Object.keys(scope), body)(...Object.values(scope));
  return { fns, sync };
}
