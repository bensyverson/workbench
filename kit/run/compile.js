// One part's build for a run: its record lowered by its Grammar, every Runtime Lambda and helper compiled through
// the JS backend, and a reader for each value output. A Kernel reads the Dialect's globals (`$`, the inputs object,
// an Event record's name, anything else the Dialect declares) by name; here each name is bound to a forwarding
// object that reads the part's current globals, which the scheduler sets before every init and step, so a Kernel
// compiled once sees each step's values.

import { emitKernel, instantiate } from "../emit/js/index.js";

/** @import { Runtime } from "../define/runtime.js" */
/** @import { Emitted } from "../emit/js/emit.js" */

/**
 * A part compiled for one record. `kernels` by lambda id; `sources` their emitted text (what a build event compares);
 * `outputs` a reader per value output, `(state, params) => value`; `globals.current` what the Kernels' global names
 * read now.
 * @typedef {{ ok: true, kernels: Record<string, (...args: any[]) => any>, sources: Record<string, string>, outputs: Record<string, (state: any, params: any) => unknown>, globals: { current: Record<string, unknown> } }} Compiled
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
  try { low = runtime.grammar.lower(record); } catch (e) { return { ok: false, diagnostics: [{ code: "R004", message: `lowering threw: ${/** @type {Error} */ (e)?.message ?? String(e)}` }] }; }
  const errors = low.diagnostics.filter((/** @type {any} */ d) => d.severity === "error" || d.severity === undefined);
  if (errors.length) return { ok: false, diagnostics: errors };
  /** @type {Record<string, any>} */
  const intrinsics = {};
  for (const [n, i] of Object.entries(/** @type {Record<string, any>} */ (dialect.intrinsics))) if (i.js) intrinsics[n] = i;
  const globals = { current: /** @type {Record<string, unknown>} */ ({}) };
  const scope = globalScope(dialect, globals);
  /** @type {Emitted[]} */
  const helperEmits = low.helpers.filter((/** @type {any} */ h) => h.kind === "fn" && h.result?.kernel).map((/** @type {any} */ h) => emitKernel(h.result.kernel, { intrinsics }));
  const helpers = helperEmits.length ? helpersWith(helperEmits, scope) : {};
  /** @type {Compiled["kernels"]} */
  const kernels = {};
  /** @type {Record<string, string>} */
  const sources = {};
  for (const l of low.lambdas) {
    if (!l.result.kernel) continue;
    const e = emitKernel(l.result.kernel, { intrinsics });
    kernels[l.ref.id] = /** @type {any} */ (instantiate(e, { ...scope, ...helpers }));
    sources[l.ref.id] = [...e.prelude, e.source].join("\n");
  }
  /** @type {Compiled["outputs"]} */
  const outputs = {};
  for (const p of Object.values(/** @type {Record<string, any>} */ (dialect.seams.out))) {
    if (p.seam.kind === "event") continue;
    if (typeof p.from === "string") { const path = p.from.split("."); outputs[p.name] = (s) => path.reduce((/** @type {any} */ v, /** @type {string} */ k) => v?.[k], s); continue; }
    const k = low.seams?.outputs?.[p.name]?.kernel;
    if (k) outputs[p.name] = /** @type {any} */ (instantiate(emitKernel(k, { intrinsics }), helpers));
  }
  return { ok: true, kernels, sources, outputs, globals };
}

/**
 * The Dialect's globals as names a Kernel can read: each a forwarding object over `globals.current[name]`. A name
 * the page already has (Math) is left to it unless the Dialect's runtime sets it.
 * @param {any} dialect @param {{ current: Record<string, unknown> }} globals
 * @returns {Record<string, unknown>}
 */
function globalScope(dialect, globals) {
  const names = new Set(Object.keys(dialect.def.globals ?? {}));
  if (dialect.seams.inputs) names.add(dialect.seams.inputs.name);
  for (const i of Object.values(/** @type {Record<string, any>} */ (dialect.seams.in))) if (i.record) names.add(i.record.name);
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
 * A program's helpers, callable by name and able to call one another, with the globals in scope.
 * @param {Emitted[]} helpers @param {Record<string, unknown>} scope
 * @returns {Record<string, (...args: any[]) => unknown>}
 */
function helpersWith(helpers, scope) {
  const prelude = [...new Set(helpers.flatMap((h) => h.prelude))];
  const body = `"use strict";\n${prelude.join("\n")}\n${helpers.map((h) => `const ${h.name} = (${h.source});`).join("\n")}\nreturn { ${helpers.map((h) => h.name).join(", ")} };`;
  return new Function(...Object.keys(scope), body)(...Object.values(scope));
}
