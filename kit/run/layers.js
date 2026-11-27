// Layers in a run (kit/compose README, "Layers"). A layer part (a composed part entry carrying `layer`) is never
// stepped: it has no state, clock, runtime or params, so it adds nothing to the log, the state hashes or stats().
// Its output, wherever it is read (a wire, pageView, snapshot), is each input wire's list carried as any Draw wire's
// is (carry, so convertOp by the planned edge) and concatenated bottom first, read from the producers as the caller
// gives them: now, or as the instant began for a delayed wire. A record whose layer has an input from no producer
// is refused (N007) rather than drawn empty.

import { carry } from "./carry.js";
import { imagesOf } from "./draw.js";

/** @import { Composed } from "../compose/compose.js" */
/** @import { Part } from "./part.js" */
/** @typedef {import("../draw/ops.js").Op} Op */
/** One input of a layer: its producer (a stepping part's Draw output, or another layer) and the wire to carry it by. @typedef {{ part: string, port: string, layer: boolean, wire: { rename: Record<string, string>, dropped: string[], convert: any[] } }} LayerInput */

/** @param {string} h  "level.out.view" */
const ends = (h) => { const [part, side, port] = h.split("."); return { part, side, port }; };

/** Whether a composed part entry is a layer: the entry carries `layer` (a name or a Dialect name cannot tell). @param {{ layer?: unknown }} cp */
export const isLayerEntry = (cp) => cp.layer !== undefined;

/**
 * The composition's layers, each with its inputs bottom first, ready to carry; and what makes the record unrunnable
 * (N007): a layer with fewer than two inputs, an input with no wire or several, or one from neither a stepping part's
 * Draw output nor another layer's `view`, and layers that feed each other.
 * @param {Composed} composed @param {Map<string, Part>} byName  the stepping parts
 * @returns {{ layers: Map<string, LayerInput[]>, problems: Array<{ code: string, message: string }> }}
 */
export function makeLayers(composed, byName) {
  /** @type {Map<string, LayerInput[]>} */
  const layers = new Map();
  /** @type {Array<{ code: string, message: string }>} */
  const problems = [];
  const entries = composed.parts.filter(isLayerEntry);
  const names = new Set(entries.map((cp) => cp.name));
  // an op keeps the name of the part whose image it draws however far it came, so a conversion sizes it from every part's
  /** @type {Record<string, any>} */
  const images = {};
  for (const p of byName.values()) Object.assign(images, imagesOf(p.name, p.runtime));
  for (const cp of entries) {
    const n = Array.isArray(cp.layer?.inputs) ? cp.layer.inputs.length : 0;
    const bad = (/** @type {string} */ why) => problems.push({ code: "N007", message: `layer '${cp.name}': ${why}; kit/compose builds every layer from two or more Draw outputs, so the record was changed by hand` });
    if (n < 2) { bad(`its record names ${n} inputs, not two or more`); continue; }
    const into = composed.wires.filter((w) => ends(w.to).part === cp.name);
    for (const w of into) { const i = ends(w.to).port; if (ends(w.to).side !== "in" || !/^\d+$/.test(i) || Number(i) >= n) bad(`the wire ${w.from} → ${w.to} names no input of it (in.0 to in.${n - 1})`); }
    /** @type {LayerInput[]} */
    const inputs = [];
    for (let i = 0; i < n; i++) {
      const ws = into.filter((w) => w.to === `${cp.name}.in.${i}`);
      if (ws.length !== 1) { bad(`in.${i} has ${ws.length === 0 ? "no wire" : `${ws.length} wires`}, so nothing it draws comes from a producer`); continue; }
      const w = ws[0], from = ends(w.from);
      const producer = byName.get(from.part);
      const draws = producer ? Object.values(/** @type {Record<string, any>} */ (producer.runtime.dialect.seams.out)).some((o) => o.name === from.port && o.draw) : names.has(from.part) && from.port === "view";
      if (from.side !== "out" || !draws) { bad(`in.${i} is wired from ${w.from}, which is not a Draw output of a part in the run`); continue; }
      inputs.push({ part: from.part, port: from.port, layer: !producer, wire: { rename: w.rename ?? {}, dropped: w.dropped ?? [], convert: w.convert.map((c) => (c.kind === "draw" ? { ...c, images } : c)) } });
    }
    layers.set(cp.name, inputs);
  }
  // layers that feed each other would never end: kit/compose cannot make them, since a layer's arguments exist before it
  /** @param {string} name @param {string[]} path @returns {boolean} */
  const loops = (name, path) => path.includes(name) || (layers.get(name) ?? []).some((i) => i.layer && loops(i.part, [...path, name]));
  for (const name of layers.keys()) if (loops(name, [])) problems.push({ code: "N007", message: `layer '${name}' is drawn from itself through other layers, so its list has no end` });
  return { layers, problems };
}

/**
 * A layer's list: each input's list carried and concatenated bottom first. `draws(part)` gives a stepping part's
 * lists as the reader sees them (now, or as the instant began); a part with none (its init failed) gives nothing.
 * @param {string} name @param {Map<string, LayerInput[]>} layers @param {(part: string) => Readonly<Record<string, readonly Op[]>> | undefined} draws
 * @returns {readonly Op[]}
 */
export function layerList(name, layers, draws) {
  /** @type {Op[]} */
  const out = [];
  for (const i of layers.get(name) ?? []) {
    const list = i.layer ? layerList(i.part, layers, draws) : draws(i.part)?.[i.port] ?? [];
    out.push(.../** @type {Op[]} */ (carry(list, i.wire)));
  }
  return Object.freeze(out);
}

/**
 * The stepping parts whose lists a layer's output holds, down through the layers under it: a consumer of the layer
 * steps after each of them (wire order).
 * @param {string} name @param {Map<string, LayerInput[]>} layers @returns {string[]}
 */
export function producersUnder(name, layers) {
  const inputs = layers.get(name);
  if (!inputs) return [name];
  return [...new Set(inputs.flatMap((i) => (i.layer ? producersUnder(i.part, layers) : [i.part])))];
}

/**
 * The stepping part and Draw output at the bottom of a layer, down through a layer at the bottom: its frame is the
 * layer's, so pageView sizes the page by it.
 * @param {string} name @param {Map<string, LayerInput[]>} layers @returns {{ part: string, port: string }}
 */
export function bottomOf(name, layers) {
  const b = /** @type {LayerInput[]} */ (layers.get(name))[0];
  return b.layer ? bottomOf(b.part, layers) : { part: b.part, port: b.port };
}
