// A glue `.frame` edge as written, and the edge it gives for two extents (README, "An anchored edge"): `"fit"`,
// `{ scale, offset }`, or `{ scale, anchor, offset? }`, whose offset the kit computes from the two frames' extents.
// An anchor is "min", "center" or "max" for every axis, an array of one per axis, or a pair `{ from, to }` of those:
// on each axis the first frame's box, scaled, has its `from` point on the second box's `to` point, and `offset` is
// added after, as a nudge. Compose plans with these at check, and kit/run again after a rebuild (replan.js).

import { normalizeEdge, fitEdge, show } from "../seam/index.js";
import { didYouMean } from "../define/codes.js";

/** @import { Edge, Box } from "../seam/frames.js" */
/** @typedef {"min" | "center" | "max"} Anchor */
/**
 * A glue edge as the composed record keeps it: "fit", or the edge as written, normalized per axis (a single anchor is
 * the pair with the same point twice).
 * @typedef {"fit" | { scale: number[], offset: number[], anchor?: { from: Anchor[], to: Anchor[] } }} Given
 */

export const ANCHORS = /** @type {const} */ (["min", "center", "max"]);
const KEYS = ["scale", "offset", "anchor"];

/**
 * An edge as the glue wrote it, for frames of `dims` axes: "fit", or `{ scale, offset?, anchor? }`.
 * @param {unknown} e @param {number} dims
 * @returns {{ ok: true, given: Given } | { ok: false, error: string }}
 */
export function glueEdge(e, dims) {
  if (e === "fit") return { ok: true, given: "fit" };
  if (e === null || typeof e !== "object" || Array.isArray(e)) return { ok: false, error: `an edge is { scale, offset }, { scale, anchor, offset? } or "fit", not ${show(e)}` };
  const { anchor, ...rest } = /** @type {Record<string, unknown>} */ (e);
  const extra = Object.keys(e).filter((k) => !KEYS.includes(k));
  if (extra.length) return { ok: false, error: `an edge takes scale, offset and anchor, not ${extra.map((k) => `'${k}'`).join(", ")}.${didYouMean(extra[0], KEYS)}` };
  const n = normalizeEdge(rest, dims);
  if (!n.ok) return n;
  if (anchor === undefined && !Object.hasOwn(e, "anchor")) return { ok: true, given: n.edge };
  const a = anchorOf(anchor, dims);
  if (typeof a === "string") return { ok: false, error: a };
  return { ok: true, given: { ...n.edge, anchor: a } };
}

/**
 * An anchor as written, per axis, or why it is not one.
 * @param {unknown} v @param {number} dims @returns {{ from: Anchor[], to: Anchor[] } | string}
 */
function anchorOf(v, dims) {
  const words = `"min", "center" or "max"`;
  /** @param {unknown} x @param {string} what @returns {Anchor[] | string} */
  const axes = (x, what) => {
    if (typeof x === "string") return ANCHORS.includes(/** @type {Anchor} */ (x)) ? Array(dims).fill(x) : `${what} is ${words} (min and max are the ends of the extent: in a Draw frame y grows downward, so min is the top), not ${show(x)}.${didYouMean(x, [...ANCHORS])}`;
    if (Array.isArray(x)) {
      if (x.length !== dims) return `${what} is one anchor for every axis or an array of ${dims} (one per axis), not ${show(x)}`;
      const bad = x.find((w) => typeof w !== "string" || !ANCHORS.includes(/** @type {Anchor} */ (w)));
      if (bad !== undefined) return `${what}'s every item is ${words}, not ${show(bad)}`;
      return /** @type {Anchor[]} */ ([...x]);
    }
    return `${what} is ${words}, or an array of ${dims} of these, not ${show(x)}`;
  };
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    const o = /** @type {Record<string, unknown>} */ (v);
    const other = Object.keys(o).filter((k) => k !== "from" && k !== "to");
    if (other.length) return `an anchor pair is { from, to }, not with ${other.map((k) => `'${k}'`).join(", ")}`;
    if (o.from === undefined || o.to === undefined) return `an anchor pair needs both from (the first frame's point) and to (the second's), not ${show(v)}`;
    const from = axes(o.from, "the anchor's from"), to = axes(o.to, "the anchor's to");
    if (typeof from === "string") return from;
    if (typeof to === "string") return to;
    return { from, to };
  }
  const one = axes(v, "an anchor");
  return typeof one === "string" ? one : { from: one, to: [...one] };
}

/** Whether a given edge reads the extents: "fit" or an anchored one. @param {Given} g */
export const derived = (g) => g === "fit" || g.anchor !== undefined;

/**
 * The edge a given edge gives for the first frame's extent `a` and the second's `b` (both needed when it is derived).
 * @param {Given} g @param {Box | undefined} a @param {Box | undefined} b @returns {Edge}
 */
export function edgeFor(g, a, b) {
  if (g === "fit") return fitEdge(/** @type {Box} */ (a), /** @type {Box} */ (b));
  if (!g.anchor) return { scale: [...g.scale], offset: [...g.offset] };
  const anchor = g.anchor, A = /** @type {Box} */ (a), B = /** @type {Box} */ (b);
  /** @param {number} lo @param {number} hi @param {Anchor} w */
  const at = (lo, hi, w) => (w === "min" ? lo : w === "max" ? hi : (lo + hi) / 2);
  const offset = g.scale.map((s, i) => {
    const x = A.min[i] * s, y = A.max[i] * s;
    return at(B.min[i], B.max[i], anchor.to[i]) - at(Math.min(x, y), Math.max(x, y), anchor.from[i]) + g.offset[i];
  });
  return { scale: [...g.scale], offset };
}

/** @param {number} x */
const num = (x) => String(Math.round(x * 1e9) / 1e9);
/** @param {Box} b */
const boxText = (b) => `[${b.min.map(num).join(", ")}]..[${b.max.map(num).join(", ")}]`;

/**
 * Where a derived edge's numbers came from, as the plan and S253 print it: `(anchored at line 5: [center, min] +[0, 4],
 * [0, 0]..[160, 24] in [0, 0]..[192, 128])`, `(fit at line 5: <box> in <box>)`; "" for an ordinary edge.
 * @param {Given} g @param {number | undefined} line @param {Box | undefined} a @param {Box | undefined} b
 */
export function derivationText(g, line, a, b) {
  if (!derived(g) || !a || !b) return "";
  const boxes = `${boxText(a)} in ${boxText(b)}`;
  if (g === "fit") return `(fit at line ${line}: ${boxes})`;
  const anchor = /** @type {{ from: Anchor[], to: Anchor[] }} */ (g.anchor);
  const same = anchor.from.every((w, i) => w === anchor.to[i]);
  const words = same ? `[${anchor.from.join(", ")}]` : `[${anchor.from.join(", ")}] on [${anchor.to.join(", ")}]`;
  return `(anchored at line ${line}: ${words} +[${g.offset.map(num).join(", ")}], ${boxes})`;
}

/** A frame's placeholder offset: `<x>` for one axis, `[<x>, <y>]` for two, … @param {number} dims */
const offsetPlaceholder = (dims) => (dims === 1 ? "<x>" : `[${["<x>", "<y>", "<z>"].slice(0, dims).join(", ")}${dims > 3 ? ", …" : ""}]`);

/**
 * The edges a `.frame` call between two frames can take, as a fix offers them, with placeholders, never numbers:
 * an ordinary edge, an anchored one, or "fit". @param {string} text  the two handles, `a.frame.x, b.frame.y` @param {number} dims
 */
export function edgeForms(text, dims) {
  return `.frame(${text}, { scale: <n>, offset: ${offsetPlaceholder(dims)} }), .frame(${text}, { scale: <n>, anchor: <anchor> }) with each <anchor> "min", "center" or "max" (or an array of one per axis, or a pair { from, to }), or .frame(${text}, "fit")`;
}

/**
 * S251's fix: the `.frame` call that would join two frames. With both extents, "fit" is offered; for a picture onto a
 * picture (a Draw wire or a layer's input) an anchor beside it, since text never scales.
 * @param {string} fa @param {string} fb  the two frame handles @param {boolean} extents  both frames declare one @param {boolean} draw
 */
export function noPathFix(fa, fb, extents, draw) {
  if (!extents) return `give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … }) ("fit" and an anchor need both frames to declare an extent)`;
  if (draw) return `place it with an anchor: .frame(${fa}, ${fb}, { scale: 1, anchor: "min" }) (at its own size, its top-left on the other's), or write .frame(${fa}, ${fb}, "fit"), or give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })`;
  return `write .frame(${fa}, ${fb}, "fit"), or give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })`;
}
