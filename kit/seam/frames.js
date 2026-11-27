// Frames and edges (the draft's "Frames"): an edge is a diagonal affine map { scale, offset } per axis, a value in
// `from` becoming value * scale + offset in `to`. The graph holds the frames of every part of a composition and
// the edges between them (a Dialect's own, from edges(record), and the glue's .frame calls); a path composes
// edges, running any of them backward, and a second path between two frames must agree with the first.

/** @typedef {{ scale: number[], offset: number[] }} Edge */
/**
 * One edge in the graph and who gave it: "glue" for a .frame call, else the part whose Dialect's edges() did. `note`
 * says where a derived edge's numbers came from (a "fit" or anchored glue edge: kit/compose's edges.js).
 */
/** @typedef {{ from: string, to: string, edge: Edge, by: string, glue?: boolean, line?: number, note?: string }} GraphEdge */
/** A path: its composed edge and the steps, each an edge as given and whether it was run backward. */
/** @typedef {{ edge: Edge, steps: Array<GraphEdge & { backward: boolean }> }} Path */

const EPS = 1e-9;

/** A value as a message writes it, whatever it is (a BigInt, a cycle, an object with no toString). @param {unknown} v */
export function show(v) {
  if (typeof v === "bigint") return `${v}n`;
  try { return JSON.stringify(v) ?? String(v); } catch { try { return String(v); } catch { return typeof v; } }
}

/** @param {unknown} v */
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * An edge as written ({ scale, offset }, each a number for every axis or an array of one per axis), for a frame of
 * `dims` axes.
 * @param {unknown} e @param {number} dims
 * @returns {{ ok: true, edge: Edge } | { ok: false, error: string }}
 */
export function normalizeEdge(e, dims) {
  if (e === null || typeof e !== "object" || Array.isArray(e)) return { ok: false, error: `an edge is { scale, offset }, not ${show(e)}` };
  const o = /** @type {Record<string, unknown>} */ (e);
  const extra = Object.keys(o).filter((k) => k !== "scale" && k !== "offset");
  if (extra.length) return { ok: false, error: `an edge takes only scale and offset, not ${extra.map((k) => `'${k}'`).join(", ")} (there is no rotation in v0)` };
  if (o.scale === undefined) return { ok: false, error: "an edge needs a scale" };
  /** @param {unknown} v @param {string} what @param {number} dflt */
  const axes = (v, what, dflt) => {
    if (v === undefined) return Array(dims).fill(dflt);
    if (finite(v)) return Array(dims).fill(v);
    if (Array.isArray(v) && v.length === dims && v.every(finite)) return /** @type {number[]} */ ([...v]);
    return `the ${what} is a number, or an array of ${dims} number${dims === 1 ? "" : "s"} (one per axis), not ${show(v)}`;
  };
  const scale = axes(o.scale, "scale", 1);
  if (typeof scale === "string") return { ok: false, error: scale };
  const offset = axes(o.offset, "offset", 0);
  if (typeof offset === "string") return { ok: false, error: offset };
  if (scale.some((s) => s === 0)) return { ok: false, error: "a scale of 0 maps a whole frame to a point; it cannot run backward" };
  return { ok: true, edge: { scale, offset } };
}

/** `a` then `b`. @param {Edge} a @param {Edge} b @returns {Edge} */
export function composeEdges(a, b) {
  return { scale: a.scale.map((s, i) => s * b.scale[i]), offset: a.offset.map((o, i) => o * b.scale[i] + b.offset[i]) };
}

/** @param {Edge} e @returns {Edge} */
export function invertEdge(e) {
  return { scale: e.scale.map((s) => 1 / s), offset: e.offset.map((o, i) => -o / e.scale[i]) };
}

/** The identity edge on `dims` axes. @param {number} dims @returns {Edge} */
export const identity = (dims) => ({ scale: Array(dims).fill(1), offset: Array(dims).fill(0) });

/** A frame's extent: the box it spans, per axis. @typedef {{ min: number[], max: number[] }} Box */

/**
 * "fit": one scale for every axis so that a's box (min..max) fits inside b's, centered.
 * @param {Box} a @param {Box} b @returns {Edge}
 */
export function fitEdge(a, b) {
  const size = (/** @type {Box} */ x, /** @type {number} */ i) => x.max[i] - x.min[i];
  const s = Math.min(...a.min.map((_, i) => size(b, i) / size(a, i)));
  return { scale: a.min.map(() => s), offset: a.min.map((lo, i) => b.min[i] + (size(b, i) - size(a, i) * s) / 2 - lo * s) };
}

/** @param {Edge} a @param {Edge} b */
export const sameEdge = (a, b) => a.scale.every((s, i) => close(s, b.scale[i])) && a.offset.every((o, i) => close(o, b.offset[i]));
/** @param {number} x @param {number} y */
const close = (x, y) => Math.abs(x - y) <= EPS * Math.max(1, Math.abs(x), Math.abs(y));

/** An edge as a message writes it: `{ scale: 32, offset: 16 }`. @param {Edge} e */
export function edgeText(e) {
  /** @param {number[]} v */
  const one = (v) => (v.every((x) => close(x, v[0])) ? num(v[0]) : `[${v.map(num).join(", ")}]`);
  return `{ scale: ${one(e.scale)}, offset: ${one(e.offset)} }`;
}
/** @param {number} x */
const num = (x) => String(Math.round(x * 1e9) / 1e9);

/**
 * A planned conversion as the draft prints it: `at: maze.cell → particles.px, point, ×32 +16`.
 * @param {{ field: string, kind: "point" | "vector" | "quantity" | "draw", rate?: true, from: string, to: string, edge: Edge }} c
 */
export function convertText(c) {
  /** @param {number[]} v */
  const one = (v) => (v.every((x) => close(x, v[0])) ? num(v[0]) : `[${v.map(num).join(", ")}]`);
  const by = c.kind === "quantity" ? `×${num(Math.abs(c.edge.scale[0]))}` : c.kind === "vector" ? `×${one(c.edge.scale)}` : `×${one(c.edge.scale)} +${one(c.edge.offset)}`;
  return `${c.field || "(value)"}: ${c.from} → ${c.to}, ${c.kind}${c.rate ? " per second" : ""}, ${by}`;
}

/** Whether a quantity can cross an edge: one scale magnitude on every axis (a flip keeps a length's size). @param {Edge} e */
export const uniform = (e) => e.scale.every((s) => close(Math.abs(s), Math.abs(e.scale[0])));

/** The frames of a composition and the edges between them. */
export class FrameGraph {
  constructor() {
    /** @type {Map<string, number>} each frame's dims */
    this.nodes = new Map();
    /** @type {GraphEdge[]} */
    this.edges = [];
  }

  /** @param {string} id @param {number} dims */
  addNode(id, dims) { this.nodes.set(id, dims); }

  /**
   * Adds an edge unless a path already joins its frames: then the path must agree (null), or the clash is returned.
   * @param {GraphEdge} e @returns {null | { existing: Path }}
   */
  add(e) {
    const existing = this.path(e.from, e.to);
    if (existing) return sameEdge(existing.edge, e.edge) ? null : { existing };
    this.edges.push(e);
    return null;
  }

  /**
   * The path from one frame to another (the shortest, by edges), or null when none joins them. A frame to itself
   * is the identity.
   * @param {string} from @param {string} to @returns {Path | null}
   */
  path(from, to) {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    /** @type {Map<string, Path>} */
    const seen = new Map([[from, { edge: identity(/** @type {number} */ (this.nodes.get(from))), steps: [] }]]);
    const queue = [from];
    while (queue.length) {
      const at = /** @type {string} */ (queue.shift());
      const here = /** @type {Path} */ (seen.get(at));
      if (at === to) return here;
      for (const e of this.edges) {
        const forward = e.from === at, backward = e.to === at;
        if (!forward && !backward) continue;
        const next = forward ? e.to : e.from;
        if (seen.has(next)) continue;
        seen.set(next, { edge: composeEdges(here.edge, forward ? e.edge : invertEdge(e.edge)), steps: [...here.steps, { ...e, backward: !forward }] });
        queue.push(next);
      }
    }
    return null;
  }
}
