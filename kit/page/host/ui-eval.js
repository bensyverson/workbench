// A package's UI (kit/define's defineUI value) read against a part's state: each tile component becomes plain data
// the page draws. A UI value is a path into the state (`"score"`, `"bounds.width"`) or a lambda `(state, $) => …`
// (a table column's `(row, state, $)`); the kit checked and lowered them, and the host calls the function it was
// given. No DOM here.

import { createRun } from "../../run/index.js";

/** @typedef {{ kind: string, [key: string]: any }} Component */

/** @param {unknown} obj @param {string} path */
export function readPath(obj, path) {
  /** @type {any} */
  let v = obj;
  for (const k of path.split(".")) { if (v === null || v === undefined) return undefined; v = v[k]; }
  return v;
}

/**
 * A UI value against the state.
 * @param {unknown} expr  a path or a lambda @param {any} state @param {Record<string, any>} $
 */
export function resolve(expr, state, $) {
  if (typeof expr === "function") return expr(state, $);
  if (typeof expr === "string") return readPath(state, expr);
  return expr;
}

/**
 * `$` for a part: each param's value, the declared one unless `values` overrides it.
 * @param {any} record  the part's built record @param {Record<string, any>} [values]
 * @returns {Record<string, any>}
 */
export function paramValues(record, values = {}) {
  /** @type {Record<string, any>} */
  const $ = {};
  for (const [name, d] of Object.entries(record?.params ?? {})) $[name] = Object.hasOwn(values, name) ? values[name] : /** @type {any} */ (d).value;
  return $;
}

/** @param {unknown} v */
const cell = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)) : v === null || v === undefined ? "" : String(v));

/**
 * One component as data. A lambda that throws is `{ kind, label, error }`, never a thrown error.
 * `plot` and `runs` carry the lambda's value or the call to make, since their history and sweeps are the page's.
 * @param {Component} c @param {any} state @param {Record<string, any>} $
 * @returns {Record<string, any>}
 */
export function evalComponent(c, state, $) {
  try {
    switch (c.kind) {
      case "stat": {
        const value = resolve(c.value, state, $);
        const max = c.max === undefined ? undefined : resolve(c.max, state, $);
        const bad = (c.badIf ? Boolean(resolve(c.badIf, state, $)) : false) || (typeof max === "number" && typeof value === "number" && value >= max);
        return { kind: "stat", label: c.label, text: cell(value), unit: c.unit ?? "", ...(max !== undefined ? { max: cell(max) } : {}), bad };
      }
      case "check": return { kind: "check", label: c.label, ok: Boolean(resolve(c.expect, state, $)) };
      case "table": {
        const rows = /** @type {any[]} */ (resolve(c.rows, state, $) ?? []).slice(0, c.limit ?? 1000);
        const cols = /** @type {any[]} */ (c.columns).map((col) => (typeof col === "string" ? { label: col, value: col } : col));
        return { kind: "table", label: c.label, columns: cols.map((x) => x.label), rows: rows.map((row) => cols.map((x) => cell(typeof x.value === "function" ? x.value(row, state, $) : readPath(row, x.value)))) };
      }
      case "plot": return { kind: "plot", label: c.label, window: c.window, y: Number(resolve(c.y, state, $)) };
      case "text": return { kind: "text", text: String(resolve(c.value, state, $) ?? "") };
      case "runs": return { kind: "runs", label: c.label, spec: c };
      case "row": case "col": return { kind: c.kind, items: c.items.map((/** @type {Component} */ i) => evalComponent(i, state, $)) };
      default: return { kind: c.kind, label: c.label, error: `unknown component kind '${c.kind}'` };
    }
  } catch (e) {
    return { kind: c.kind, label: c.label, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Every tile of a UI, in its declared order, with its components evaluated.
 * @param {any} ui @param {any} state @param {Record<string, any>} $
 * @returns {{ id: string, title: string, place: any, body: Record<string, any>[] }[]}
 */
export function evalTiles(ui, state, $) {
  return Object.entries(ui?.tiles ?? {}).map(([id, t]) => ({ id, title: /** @type {any} */ (t).title, place: /** @type {any} */ (t).place, body: /** @type {any} */ (t).body.map((/** @type {Component} */ c) => evalComponent(c, state, $)) }));
}

/**
 * A `runs` tile: `steps` fresh runs of the composition with `param` spread from `from` to `to` (each value clamped to
 * the param's range), each `seconds` long, `y` read from the part's last state with `$` at that run's value.
 * @param {{ composed: any, runtimes: any[], part: string, spec: Component }} o
 * @returns {{ x: number, y: number }[]}
 */
export function sweepRuns({ composed, runtimes, part, spec }) {
  const decl = composed.parts.find((/** @type {any} */ p) => p.name === part)?.record.params?.[spec.param];
  if (!decl) return [];
  const out = [];
  for (let i = 0; i < spec.steps; i++) {
    const raw = spec.from + ((spec.to - spec.from) * i) / (spec.steps - 1);
    const x = Math.min(decl.max ?? raw, Math.max(decl.min ?? raw, raw));
    const run = createRun(composed, { runtimes, params: { [part]: { [spec.param]: x } } });
    run.runUntil(spec.seconds);
    const record = composed.parts.find((/** @type {any} */ p) => p.name === part).record;
    out.push({ x, y: Number(resolve(spec.y, run.state(part), paramValues(record, { [spec.param]: x }))) });
  }
  return out;
}

/** A plot's history: points by key, trimmed to the window, and dropped past a rewind. */
export class SeriesStore {
  /** @type {Map<string, { T: number, y: number }[]>} */
  series = new Map();
  /** @param {string} key @param {number} T @param {number} y @param {number} [window]  seconds kept (the whole history when omitted) */
  add(key, T, y, window) {
    let s = this.series.get(key);
    if (!s) this.series.set(key, (s = []));
    while (s.length && s[s.length - 1].T > T) s.pop(); // a rewind is a branch: later points are not the run's
    if (s.length && s[s.length - 1].T === T) s[s.length - 1].y = y; else s.push({ T, y });
    if (window !== undefined) while (s.length > 1 && s[0].T < T - window) s.shift();
  }
  /** @param {string} key */
  get(key) { return this.series.get(key) ?? []; }
  clear() { this.series.clear(); }
}

/**
 * The paths of the numbers in a state that are not inside a list: what the generated traces view plots.
 * @param {any} state @param {string} [prefix] @returns {string[]}
 */
export function numberPaths(state, prefix = "") {
  if (typeof state === "number") return Number.isFinite(state) && prefix ? [prefix] : [];
  if (state === null || typeof state !== "object" || Array.isArray(state)) return [];
  return Object.entries(state).flatMap(([k, v]) => numberPaths(v, prefix ? `${prefix}.${k}` : k));
}

/**
 * An annotation (`note`, `badge`, `tone`: each a value or a lambda) resolved against the state.
 * @param {any} a @param {any} state @param {Record<string, any>} $
 * @returns {{ note?: string, badge?: string, tone?: string }}
 */
export function resolveAnnotation(a, state, $) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of ["note", "badge", "tone"]) {
    if (!a || a[k] === undefined) continue;
    try { const v = typeof a[k] === "function" ? a[k](state, $) : a[k]; if (v !== null && v !== undefined) out[k] = String(v); } catch (e) { out[k] = `(${e instanceof Error ? e.message : e})`; }
  }
  return out;
}

/**
 * The annotation for a param: its own key, else `"*"`'s, the own keys winning field by field.
 * @param {any} ui @param {string} name @param {any} state @param {Record<string, any>} $
 */
export function paramAnnotation(ui, name, state, $) {
  const p = ui?.annotate?.params ?? {};
  return { ...resolveAnnotation(p["*"], state, $), ...resolveAnnotation(p[name], state, $) };
}
