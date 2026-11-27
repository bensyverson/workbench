// A UI compiled against one Program: every lambda lowered (lower.js), then emitted through the JS backend and
// instantiated as kit/run does a Program's Kernels, so a host never calls the author's functions. `evaluate(state, $)`
// reads every tile and annotation against one state: each component as plain data, its values as the Kernels gave
// them (a host formats them). A lambda that did not lower, or that throws, is that component's `error`, never a throw.

import { emitKernel, instantiate } from "../../emit/js/index.js";
import { PAGE_GLOBALS } from "../page-globals.js";
import { lowerUI, idOf } from "./lower.js";

/** @import * as T from "../define.js" */
/** @import { UILowered, UILowerDiagnostic } from "./lower.js" */

/**
 * One component, evaluated. `error` (with `code` when it is a lowering diagnostic's) replaces the values when a
 * lambda of it did not lower or threw. `runs` carries its spec and `y`, the id `value` reads its y by.
 * @typedef {{ kind: string, label?: string, error?: string, code?: string, element?: string, [key: string]: unknown }} Evaluated
 */

/** @typedef {{ id: string, title: string, place: unknown, body: Evaluated[] }} EvaluatedTile */
/** @typedef {{ note?: string, badge?: string | null, tone?: string | null }} Annotation */

/**
 * @typedef {object} UICompiled
 * @property {boolean} ok  every lambda lowered
 * @property {UILowerDiagnostic[]} diagnostics  ui.lower's
 * @property {Record<string, Array<Record<string, any>>>} instances  each keyed Control's instances for this record (ui.lower's)
 * @property {(state: any, $: Record<string, unknown>) => { tiles: EvaluatedTile[], annotate: Record<string, Record<string, Annotation>> }} evaluate
 * @property {(id: string, ...args: unknown[]) => unknown} value  one value by its id (`tiles.<tile>.body[0].y`): a lambda's Kernel called with `args` (exactly `state, $`; a column's `row, state, $`), a path read from the first argument, a literal as it is; throws when the lambda did not lower or is handed another number of arguments
 * @property {(view: string, key: string, state: any, $: Record<string, unknown>) => Annotation} annotation  one key's annotation; under `params`, `"*"`'s fields under the key's own
 */

/** A path's value: `"bounds.width"` read from `obj`. @param {unknown} obj @param {string} path */
function readPath(obj, path) {
  /** @type {any} */
  let v = obj;
  for (const k of path.split(".")) { if (v === null || v === undefined) return undefined; v = v[k]; }
  return v;
}

/** @param {unknown} e */
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

/**
 * The Dialect's globals a UI Kernel may name, bound so it never reads the host's, as kit/run binds a Program's: each
 * a forwarding object over `current[name]`. The params' name (`params.name`, `$` by default) is the params a call is
 * handed (its last argument); the page globals
 * are the page's; every other global has no value, since a view runs outside a step, and reading it throws. A name no
 * identifier spells cannot appear in a lambda's source, so it needs no binding.
 * @param {Record<string, any>} def @param {{ current: Record<string, unknown> }} globals
 */
function globalScope(def, globals) {
  /** @type {Record<string, unknown>} */
  const scope = {};
  for (const n of Object.keys(def.globals ?? {})) {
    if (PAGE_GLOBALS.includes(n) || !/^[A-Za-z_$][\w$]*$/.test(n)) continue;
    const target = () => {
      const v = globals.current[n];
      if (v === null || typeof v !== "object") throw new TypeError(`a UI lambda reads the global '${n}', which has no value outside a step`);
      return /** @type {object} */ (v);
    };
    const no = () => { throw new TypeError(`a UI lambda cannot write the global '${n}'`); };
    scope[n] = new Proxy({}, { get: (_t, k) => Reflect.get(target(), k), has: (_t, k) => Reflect.has(target(), k), set: no, apply: no });
  }
  return scope;
}

/**
 * Compiles every lambda of `ui` against one Program's record.
 * @param {T.UI} ui @param {Record<string, any>} record
 * @returns {UICompiled}
 */
export function compileUI(ui, record) {
  /** @type {UILowered} */
  const low = lowerUI(ui, record);
  const def = /** @type {Record<string, any>} */ (ui.dialect.def);
  /** @type {Record<string, any>} */
  const intrinsics = {};
  for (const [n, i] of Object.entries(/** @type {Record<string, any>} */ (ui.dialect.intrinsics ?? {}))) if (i.js) intrinsics[n] = i;
  const globals = { current: /** @type {Record<string, unknown>} */ ({}) };
  const scope = globalScope(def, globals);
  const helperEmits = low.helpers.filter((h) => h.kind === "fn" && h.result?.kernel).map((h) => emitKernel(/** @type {any} */ (h.result.kernel), { intrinsics }));
  const helpers = helperEmits.length ? helpersWith(helperEmits, scope) : {};
  // the name a lambda reads the params by, free (the Dialect's `params.name`)
  const via = typeof def.params?.name === "string" ? def.params.name : "$";
  /** @type {Record<string, (...args: unknown[]) => unknown>} */
  const fns = {};
  for (const [id, k] of Object.entries(low.kernels)) {
    const fn = /** @type {(...args: unknown[]) => unknown} */ (instantiate(emitKernel(k, { intrinsics }), { ...scope, ...helpers }));
    // every call ends with the params: `state, $`, a column's `row, state, $`
    fns[id] = (...args) => { globals.current = { [via]: args[args.length - 1] }; return fn(...args); };
  }
  /** Each lambda's convention, which `value` holds a call to, by id. @type {Map<string, string[]>} */
  const conventions = new Map(low.lambdas.map((l) => [l.id, l.row ? ["row", "state", "$"] : ["state", "$"]]));
  /** The first error lowering gave each lambda, by id. @type {Map<string, UILowerDiagnostic>} */
  const failed = new Map();
  for (const d of low.diagnostics) if ("id" in d && (d.severity === "error" || d.severity === undefined) && !failed.has(d.id)) failed.set(d.id, d);

  /** Thrown for a lambda that did not lower, carrying its code. */
  class NotLowered extends Error {
    /** @param {UILowerDiagnostic} d */
    constructor(d) { super(`${d.code} ${d.message}`); this.code = d.code; }
  }

  /**
   * A declared value at a place: a lambda's Kernel called, a path read from the first argument, a literal as it is.
   * @param {unknown} decl @param {Array<string | number>} path @param {unknown[]} args
   */
  function at(decl, path, args) {
    if (typeof decl === "function") {
      const id = idOf(path);
      const fn = fns[id];
      if (fn) return fn(...args);
      const d = failed.get(id);
      throw d ? new NotLowered(d) : new Error(`the lambda at ${id} has no Kernel`);
    }
    if (typeof decl === "string") return readPath(args[0], decl);
    return decl;
  }

  /**
   * @param {Record<string, any>} c @param {Array<string | number>} p  its place @param {any} s @param {Record<string, unknown>} $
   * @returns {Evaluated}
   */
  function component(c, p, s, $) {
    const k = (/** @type {string} */ key) => [...p, key];
    const element = typeof c.element === "string" ? { element: c.element } : {};
    try {
      switch (c.kind) {
        case "stat": {
          const value = at(c.value, k("value"), [s, $]);
          const max = c.max === undefined ? undefined : at(c.max, k("max"), [s, $]);
          // red at its max and past it, and while badIf holds (Ben, 2026-11-25)
          const bad = (c.badIf !== undefined && Boolean(at(c.badIf, k("badIf"), [s, $]))) || (typeof max === "number" && typeof value === "number" && value >= max);
          return { kind: "stat", label: c.label, value, ...(c.unit !== undefined ? { unit: c.unit } : {}), ...(max !== undefined ? { max } : {}), bad, ...element };
        }
        case "check": return { kind: "check", label: c.label, ok: Boolean(at(c.expect, k("expect"), [s, $])), ...element };
        case "table": {
          const list = at(c.rows, k("rows"), [s, $]);
          const items = Array.isArray(list) ? list.slice(0, c.limit ?? list.length) : [];
          const cols = /** @type {any[]} */ (c.columns);
          return {
            kind: "table", label: c.label, ...element,
            columns: cols.map((col) => (typeof col === "string" ? col : col.label)),
            rows: items.map((row) => cols.map((col, j) => (typeof col === "string" ? readPath(row, col) : at(col.value, [...p, "columns", j, "value"], [row, s, $])))),
          };
        }
        case "plot": return { kind: "plot", label: c.label, window: c.window, y: at(c.y, k("y"), [s, $]), ...element };
        case "text": return { kind: "text", value: at(c.value, k("value"), [s, $]), ...element };
        case "runs": return { kind: "runs", label: c.label, param: c.param, from: c.from, to: c.to, steps: c.steps, seconds: c.seconds, y: idOf(k("y")), ...element };
        case "row": case "col": return { kind: c.kind, items: c.items.map((/** @type {any} */ item, /** @type {number} */ i) => component(item, [...p, "items", i], s, $)) };
        default: return { kind: String(c.kind), error: `unknown component kind '${c.kind}'` };
      }
    } catch (e) {
      return { kind: c.kind, ...(c.label !== undefined ? { label: c.label } : {}), error: messageOf(e), ...(e instanceof NotLowered ? { code: e.code } : {}) };
    }
  }

  /** @param {string} view @param {string} key @param {any} s @param {Record<string, unknown>} $ @returns {Annotation} */
  function marks(view, key, s, $) {
    const a = /** @type {Record<string, Record<string, any>>} */ (ui.annotate)[view]?.[key];
    if (!a) return {};
    /** @type {Annotation} */
    const out = {};
    if (a.note !== undefined) out.note = a.note;
    for (const m of /** @type {const} */ (["badge", "tone"])) {
      if (a[m] === undefined) continue;
      // an annotation's string is its text, not a path
      try { out[m] = /** @type {string | null} */ (typeof a[m] === "function" ? at(a[m], ["annotate", view, key, m], [s, $]) : a[m]); } catch (e) { out[m] = `(${messageOf(e)})`; }
    }
    return out;
  }

  return {
    ok: failed.size === 0,
    diagnostics: low.diagnostics,
    instances: low.instances,
    evaluate(state, $) {
      const tiles = Object.entries(ui.tiles).map(([id, t]) => ({
        id, title: /** @type {any} */ (t).title, place: /** @type {any} */ (t).place,
        body: /** @type {any[]} */ (t.body).map((c, i) => component(c, ["tiles", id, "body", i], state, $)),
      }));
      /** @type {Record<string, Record<string, Annotation>>} */
      const annotate = {};
      for (const [view, keys] of Object.entries(/** @type {Record<string, Record<string, unknown>>} */ (ui.annotate))) {
        annotate[view] = Object.fromEntries(Object.keys(keys).map((key) => [key, marks(view, key, state, $)]));
      }
      return { tiles, annotate };
    },
    value(id, ...args) {
      // a lambda's params are its last argument, so a call one short would bind the state as them
      const conv = conventions.get(id);
      if (conv && args.length !== conv.length) throw new TypeError(`value(${id}) takes (${conv.join(", ")}), ${conv.length} arguments, not ${args.length}`);
      const fn = fns[id];
      if (fn) return fn(...args);
      const d = failed.get(id);
      if (d) throw new NotLowered(d);
      const decl = declaredAt(ui, id);
      if (decl === undefined) throw new Error(`the UI has nothing at ${id}`);
      return at(decl, [], args);
    },
    annotation(view, key, state, $) {
      const own = marks(view, key, state, $);
      return view === "params" && key !== "*" ? { ...marks(view, "*", state, $), ...own } : own;
    },
  };
}

/**
 * The declaration's value at an id that names no lambda (a path or a literal), by walking the frozen value.
 * @param {T.UI} ui @param {string} id
 */
function declaredAt(ui, id) {
  /** @type {any} */
  let v = ui;
  for (const m of id.matchAll(/(?:^|\.)([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g)) {
    if (v === null || typeof v !== "object") return undefined;
    const key = m[1] ?? (m[2] !== undefined ? Number(m[2]) : JSON.parse(m[3]));
    v = Object.hasOwn(v, key) ? v[key] : undefined;
  }
  return v;
}

/**
 * The UI's Library units, callable by name and able to call one another, with the globals in scope.
 * @param {import("../../emit/js/emit.js").Emitted[]} helpers @param {Record<string, unknown>} scope
 * @returns {Record<string, (...args: unknown[]) => unknown>}
 */
function helpersWith(helpers, scope) {
  const prelude = [...new Set(helpers.flatMap((h) => h.prelude))];
  const body = `"use strict";\n${prelude.join("\n")}\n${helpers.map((h) => `const ${h.name} = (${h.source});`).join("\n")}\nreturn { ${helpers.map((h) => h.name).join(", ")} };`;
  return new Function(...Object.keys(scope), body)(...Object.values(scope));
}
