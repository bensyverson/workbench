// The pointer on the stage (project/2026-11-27-controls-draft.md, requirements 5, 6 and 10), as pure functions over a
// page view: a canvas point undone through the host's zoom and pan and the stage's corner; the ops under it, topmost
// first, each with its part and its point in that part's own frame (a layer's input edge inverted); the record a part's
// pointer input takes. kit/page's page routes it; no DOM here.

import { hitsAt } from "../draw/index.js";

/** @typedef {{ zoom: number, pan: number[] }} View */
/** The phase each DOM pointer event type makes. */
export const PHASES = Object.freeze({ pointerdown: "down", pointermove: "move", pointerup: "up", pointercancel: "cancel", wheel: "wheel", pointerleave: "leave" });

/**
 * A canvas point in the shown frame: the host's zoom and pan undone, then the page's translation by the extent's corner.
 * @param {number} x @param {number} y @param {View} view @param {{ min: number[] } | null} box
 */
export const toStage = (x, y, view, box) => [(x - view.pan[0]) / view.zoom + (box?.min[0] ?? 0), (y - view.pan[1]) / view.zoom + (box?.min[1] ?? 0)];

/**
 * A shown-frame point in canvas pixels: toStage inverted (the stage's corner, then the host's zoom and pan).
 * @param {number[]} p @param {View} view @param {{ min: number[] } | null} box
 */
export const fromStage = (p, view, box) => [(p[0] - (box?.min[0] ?? 0)) * view.zoom + view.pan[0], (p[1] - (box?.min[1] ?? 0)) * view.zoom + view.pan[1]];

/**
 * The draw edge that carries a part's output into the shown layer, from the composed wires: `{ scale, offset }`,
 * composed through nested layers, or null when the part is the shown one (no edge). Only the layer wires on the path
 * down from the shown layer count: an output that also feeds a layer the page does not show is not mapped through it.
 * @param {any} composed @param {string} shown @param {string} part @param {string} port
 * @returns {{ scale: number[], offset: number[] } | null}
 */
export function edgeInto(composed, shown, part, port) {
  const layers = new Set(composed.parts.filter((/** @type {any} */ p) => p.layer !== undefined).map((/** @type {any} */ p) => p.name));
  /** @param {any} w */
  const edgeOf = (w) => { const c = w.convert.find((/** @type {any} */ x) => x.kind === "draw"); return c ? { scale: c.scale, offset: c.offset } : { scale: [1, 1], offset: [0, 0] }; };
  /** A layer's edge, then the edge of the wire that carries that layer into the next one up. @param {{ scale: number[], offset: number[] }} inner @param {{ scale: number[], offset: number[] }} outer */
  const then = (inner, outer) => ({ scale: inner.scale.map((s, i) => s * outer.scale[i]), offset: inner.offset.map((o, i) => o * outer.scale[i] + outer.offset[i]) });
  /** @param {string} layer @param {Set<string>} seen @returns {{ scale: number[], offset: number[] } | null} */
  const down = (layer, seen) => {
    const into = composed.wires.filter((/** @type {any} */ w) => w.to.startsWith(`${layer}.`));
    const direct = into.find((/** @type {any} */ w) => w.from === `${part}.out.${port}`);
    if (direct) return edgeOf(direct);
    for (const w of into) {
      const from = w.from.split(".")[0];
      if (!layers.has(from) || seen.has(from)) continue;
      const inner = down(from, new Set([...seen, from]));
      if (inner) return then(inner, edgeOf(w));
    }
    return null;
  };
  return layers.has(shown) ? down(shown, new Set([shown])) : null;
}

/** A shown-frame point in a part's frame: the part's edge into the shown layer inverted. @param {number[]} p @param {{ scale: number[], offset: number[] } | null} e */
export const intoPart = (p, e) => (e ? p.map((v, i) => (v - e.offset[i]) / e.scale[i]) : [...p]);
/** A part-frame point in the shown frame. @param {number[]} p @param {{ scale: number[], offset: number[] } | null} e */
export const fromPart = (p, e) => (e ? p.map((v, i) => v * e.scale[i] + e.offset[i]) : [...p]);

/**
 * Every op under a shown-frame point, topmost first: its part, output, id ('' when it has none) and the point in that
 * part's frame.
 * @param {any} v  kit/run's pageView @param {number[]} point @param {any} composed
 * @returns {Array<{ part: string, output: string, id: string, at: number[], index: number }>}
 */
export function hitsOf(v, point, composed) {
  return hitsAt(v.list, point, v.images).map(({ op, index }) => {
    const part = v.parts?.[index] ?? v.part, output = v.ports?.[index] ?? v.port;
    return { part, output, id: typeof /** @type {any} */ (op).id === "string" ? /** @type {any} */ (op).id : "", at: intoPart(point, edgeInto(composed, v.part, part, output)), index };
  });
}

/**
 * The record a part's pointer input takes for one DOM-like event, in the part's frame.
 * @param {Record<string, any>} event @param {number[]} at @param {string} hit
 */
export function pointerRecord(event, at, hit) {
  return {
    phase: /** @type {Record<string, string>} */ (PHASES)[event.type], at, pointer: Number(event.pointerId ?? 0), buttons: Number(event.buttons ?? 0),
    clicks: Number(event.detail ?? 0), wheel: [Number(event.deltaX ?? 0), Number(event.deltaY ?? 0)], hit,
    shift: !!event.shiftKey, alt: !!event.altKey, meta: !!(event.metaKey || event.ctrlKey),
  };
}
