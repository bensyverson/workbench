// The frame plan of a composed record, made again for the records in force (README, "An anchored edge" ▸ "How
// kit/run sees a rebuilt extent"): the frame graph from the parts' frames, each Dialect's edges(record) for the
// record now in force, then the glue's edges (`frames`) in order, each "fit" or anchored edge computed from the
// extents now in force; then each wire's conversions along its path. kit/run calls it after a rebuild; a plan that
// fails (S251, S253, S254, S256) fails that rebuild. Compose's own check builds the same graph with every diagnostic
// (analyze.js); this is the same rule, with a message per failure and no sides.

import { FrameGraph, edgeText, uniform, SECONDS } from "../seam/index.js";
import { derived, edgeFor, derivationText } from "./edges.js";

/** @import { Edge, Box, Path, GraphEdge } from "../seam/frames.js" */
/** @import { Composed, Conversion } from "./compose.js" */
/**
 * A stepping part's frames for the record in force: each frame's dims, its extents and the Dialect's edges(record), as
 * the part's lowering gives them (kit/define's `seams.extents` and `seams.edges`).
 * @typedef {{ frames: Record<string, { dims: number }>, extents: Record<string, Box>, edges: Array<{ from: string, to: string, edge: Edge }> }} PartFrames
 */
/** @typedef {{ ok: true, convert: Conversion[][], frames: Edge[], edges: GraphEdge[] } | { ok: false, diagnostics: Array<{ code: string, message: string }> }} Replan */

/**
 * A conversion's numbers as the record keeps them: a point's scale and offset per axis, a vector's scale per axis
 * (sign kept, no offset), a quantity's one magnitude (a length is a size: a flip does not make it negative). A rate
 * converts as its kind: the kit's s is the same in every part.
 * @param {"point" | "vector" | "quantity" | "draw"} kind @param {Edge} edge
 * @returns {{ scale: number[], offset: number[] }}
 */
export function planOf(kind, edge) {
  if (kind === "quantity") return { scale: [Math.abs(edge.scale[0])], offset: [0] };
  return { scale: edge.scale, offset: kind === "point" || kind === "draw" ? edge.offset : edge.offset.map(() => 0) };
}

/** Where a path's derived steps came from, for a plan line: ` (anchored at line …)` per anchored or fit step. @param {Path} path */
export const notesOf = (path) => path.steps.filter((s) => s.note).map((s) => ` ${s.note}`).join("");

/** @param {string} id  "level.cell" */
const split = (id) => { const i = id.indexOf("."); return [id.slice(0, i), id.slice(i + 1)]; };

/**
 * Plans a composed record's conversions again, from the parts' frames in force. Each wire's conversions keep their
 * fields, kinds and frame names; only their numbers follow the edges. `frames` is each glue edge as computed now, in
 * the record's order; `edges` the graph's edges, for telling which moved.
 * @param {Pick<Composed, "parts" | "wires"> & { frames?: Composed["frames"] }} composed
 * @param {(part: string) => PartFrames | null} framesOf  null for the page, a layer, or a part not running
 * @returns {Replan}
 */
export function replan(composed, framesOf) {
  /** @type {Array<{ code: string, message: string }>} */
  const fail = [];
  const graph = new FrameGraph();
  graph.addNode(SECONDS, 1);
  /** @type {Map<string, string>} */
  const layerFrame = new Map();
  /** @type {Map<string, string>} */
  const dialectOf = new Map();
  for (const cp of composed.parts) { dialectOf.set(cp.name, cp.dialect); if (cp.layer) layerFrame.set(cp.name, cp.layer.frame); }
  const node = (/** @type {string} */ part, /** @type {string} */ f) => (f === SECONDS ? SECONDS : layerFrame.get(part) ?? `${part}.${f}`);
  /** A frame as messages write it: maze.cell. @param {string} id */
  const frameName = (id) => { if (id === SECONDS) return SECONDS; const [pn, f] = split(id); return `${dialectOf.get(pn) ?? pn}.${f}`; };
  /** @param {Path} path */
  const pathText = (path) => path.steps.map((s) => `${frameName(s.backward ? s.to : s.from)} → ${frameName(s.backward ? s.from : s.to)} ${s.glue ? `(.frame at line ${s.line})` : `(${s.by}'s edges)`}${s.backward ? " run backward" : ""} ${edgeText(s.edge)}${s.note ? ` ${s.note}` : ""}`).join("; ");

  for (const cp of composed.parts) {
    if (cp.layer) continue;
    const pf = framesOf(cp.name);
    if (!pf) continue;
    for (const [f, d] of Object.entries(pf.frames)) graph.addNode(`${cp.name}.${f}`, d.dims);
    for (const e of pf.edges) {
      const from = `${cp.name}.${e.from}`, to = `${cp.name}.${e.to}`;
      const clash = graph.add({ from, to, edge: e.edge, by: cp.dialect });
      if (clash) fail.push({ code: "S253", message: `part '${cp.name}': the ${cp.dialect} Dialect's edges relate ${frameName(from)} to ${frameName(to)} twice, and the two disagree: ${pathText(clash.existing)}, against ${edgeText(e.edge)}` });
    }
  }
  /** @type {Edge[]} */
  const frames = [];
  for (const f of composed.frames ?? []) {
    const [pa, fa] = split(f.from), [pb, fb] = split(f.to);
    const ea = framesOf(pa)?.extents[fa], eb = framesOf(pb)?.extents[fb];
    if (derived(f.given) && (!ea || !eb)) {
      const missing = [!ea ? frameName(f.from) : null, !eb ? frameName(f.to) : null].filter(Boolean);
      fail.push({ code: "S256", message: `the .frame at line ${f.line} (${frameName(f.from)} to ${frameName(f.to)}, ${f.given === "fit" ? '"fit"' : "anchored"}): ${missing.join(" and ")} now declare${missing.length === 1 ? "s" : ""} no extent, so the edge cannot be computed` });
      continue;
    }
    const edge = edgeFor(f.given, ea, eb);
    const note = derivationText(f.given, f.line, ea, eb);
    const clash = graph.add({ from: f.from, to: f.to, edge, by: "glue", glue: true, line: f.line, ...(note ? { note } : {}) });
    if (clash) { fail.push({ code: "S253", message: `the .frame at line ${f.line} now gives ${edgeText(edge)}${note ? ` ${note}` : ""}, and another path joins ${frameName(f.from)} and ${frameName(f.to)} with ${edgeText(clash.existing.edge)}: ${pathText(clash.existing)}` }); continue; }
    frames.push(edge);
  }
  if (fail.length) return { ok: false, diagnostics: fail };

  /** @type {Conversion[][]} */
  const convert = composed.wires.map((w) => w.convert.map((c) => {
    const a = node(split(w.from)[0], c.from === SECONDS ? SECONDS : split(c.from)[1]);
    const b = node(split(w.to)[0], c.to === SECONDS ? SECONDS : split(c.to)[1]);
    const path = graph.path(a, b);
    if (!path) { fail.push({ code: "S251", message: `${w.from} → ${w.to}: ${c.field || "the value"} in ${c.from} has no frame path to ${c.to} for the records now in force` }); return c; }
    if (c.kind === "quantity" && !uniform(path.edge)) { fail.push({ code: "S254", message: `${w.from} → ${w.to}: ${c.field || "the value"} is a quantity, and the path from ${c.from} to ${c.to} now scales its axes differently (${edgeText(path.edge)}): ${pathText(path)}` }); return c; }
    return { ...c, ...planOf(c.kind, path.edge) };
  }));
  if (fail.length) return { ok: false, diagnostics: fail };
  return { ok: true, convert, frames, edges: graph.edges };
}
