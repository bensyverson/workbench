// The page's side of a package's UI: kit/define's `ui.compile(record).evaluate(state, $)` gives every component's
// values; here they become the text the panels show (a number to three places), and the plot histories and the
// generated traces are kept. Every value is the kit's; the host only formats and remembers. No DOM here.

/** @typedef {import("../../define/ui/compile.js").Evaluated} Evaluated */
/** @typedef {import("../../define/ui/compile.js").EvaluatedTile} EvaluatedTile */

/** @param {unknown} obj @param {string} path */
export function readPath(obj, path) {
  /** @type {any} */
  let v = obj;
  for (const k of path.split(".")) { if (v === null || v === undefined) return undefined; v = v[k]; }
  return v;
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

/** A value as a panel shows it. @param {unknown} v */
export const cell = (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)) : v === null || v === undefined ? "" : String(v));

/**
 * One evaluated component as the panels draw it: its values as text. A `runs` keeps its spec for the sweep.
 * @param {Evaluated} c
 * @returns {Record<string, any>}
 */
export function shown(c) {
  if (c.error !== undefined) return { kind: c.kind, label: c.label, error: c.error };
  switch (c.kind) {
    case "stat": return { kind: "stat", label: c.label, text: cell(c.value), unit: c.unit ?? "", ...(c.max !== undefined ? { max: cell(c.max) } : {}), bad: c.bad };
    case "table": return { kind: "table", label: c.label, columns: c.columns, rows: /** @type {unknown[][]} */ (c.rows).map((r) => r.map(cell)) };
    case "plot": return { kind: "plot", label: c.label, window: c.window, y: Number(c.y) };
    case "text": return { kind: "text", text: cell(c.value) };
    case "runs": return { kind: "runs", label: c.label, spec: c };
    case "row": case "col": return { kind: c.kind, items: /** @type {Evaluated[]} */ (c.items).map(shown) };
    default: return { ...c };
  }
}

/**
 * Every tile, its components shown.
 * @param {EvaluatedTile[]} tiles
 * @returns {{ id: string, title: string, place: any, body: Record<string, any>[] }[]}
 */
export const shownTiles = (tiles) => tiles.map((t) => ({ id: t.id, title: t.title, place: t.place, body: t.body.map(shown) }));

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
