// The run's frame plan (kit/compose README, "An anchored edge" ▸ "How kit/run sees a rebuilt extent"; Ben's ruling,
// 2026-11-27). Each wire's conversions start as the composed record planned them; after a rebuild that changes a
// part's record, kit/compose's replan plans them again from the composed record's `frames`, with each Dialect's
// edges(record) and each "fit" or anchored edge computed for the records now in force. A trial plan is made before the
// rebuild commits, so one that fails fails the rebuild; one that succeeds applies to every run wire and layer input
// at once. An Event record already queued was converted when it crossed (delivery.js), so it keeps its conversion.
// The plan is a function of the records in force, so a checkpoint keeps it and a rewind restores it.

import { replan } from "../compose/replan.js";
import { sameEdge } from "../seam/index.js";
import { imagesOf } from "./draw.js";

/** @import { Composed, Conversion } from "../compose/compose.js" */
/** @import { Edge, GraphEdge } from "../seam/frames.js" */
/** @import { Part } from "./part.js" */
/** @import { Compiled } from "./compile.js" */
/** @import { Wire } from "./wires.js" */
/** @import { LayerInput } from "./layers.js" */

/** The conversions of every composed wire, by its index in the record, and the graph edges and glue edges that gave them (null until first needed). @typedef {{ convert: Conversion[][], frames: Edge[] | null, edges: GraphEdge[] | null }} Plan */
/** An edge a re-plan moved: its two frames (`<part>.<frame>`) and its numbers before and after (null: it was not there). @typedef {{ from: string, to: string, before: Edge | null, after: Edge | null }} Moved */

/**
 * @param {Composed} composed @param {Map<string, Part>} byName  the stepping parts
 * @param {Wire[]} wires  the run's wires (each composed one carries its record index, `source`) @param {Map<string, LayerInput[]>} layers
 */
export function createPlanner(composed, byName, wires, layers) {
  /** @type {Record<string, any>} */
  const images = {};
  for (const p of byName.values()) Object.assign(images, imagesOf(p.name, p.runtime));
  /** @param {Conversion[]} cs */
  const withImages = (cs) => cs.map((c) => (c.kind === "draw" ? { ...c, images } : c));
  /** @type {Plan} */
  let current = { convert: composed.wires.map((w) => w.convert), frames: null, edges: null };

  /** Each stepping part's frames as its compiled record gives them, `over` standing in for one part's. @param {{ name: string, compiled: Compiled } | null} over */
  const framesOf = (over) => (/** @type {string} */ name) => {
    const p = byName.get(name);
    if (!p) return null;
    const compiled = over && over.name === name ? over.compiled : p.compiled;
    return { frames: /** @type {Record<string, { dims: number }>} */ (p.runtime.dialect.seams.frames), extents: compiled.frames.extents, edges: compiled.frames.edges };
  };

  /** @param {Plan} plan */
  function apply(plan) {
    current = plan;
    for (const w of wires) if (w.source !== undefined) w.convert = withImages(plan.convert[w.source]);
    for (const inputs of layers.values()) for (const i of inputs) i.wire.convert = withImages(plan.convert[i.source]);
  }

  return {
    /**
     * The plan if part `name` were rebuilt with `compiled`, and the edges it moves; or the diagnostics that fail the
     * rebuild (S251, S253, S254, S256). Nothing changes until `apply`.
     * @param {string} name @param {Compiled} compiled
     * @returns {{ ok: true, plan: Plan, moved: Moved[] } | { ok: false, diagnostics: Array<{ code: string, message: string }> }}
     */
    trial(name, compiled) {
      if (!current.edges) {
        const base = replan(composed, framesOf(null));
        if (!base.ok) return { ok: false, diagnostics: base.diagnostics.map((d) => ({ code: d.code, message: `the composed record's own plan fails before this rebuild: ${d.message}` })) };
        current = { ...current, edges: base.edges };
      }
      const r = replan(composed, framesOf({ name, compiled }));
      if (!r.ok) return r;
      return { ok: true, plan: { convert: r.convert, frames: r.frames, edges: r.edges }, moved: movedEdges(current.edges ?? [], r.edges) };
    },
    apply,
    /** What a checkpoint keeps. */
    save: () => current,
    /** @param {Plan} plan */
    restore: (plan) => apply(plan),
    /** The composed record in force: each stepping part's record now, each wire's conversions and each glue edge as last planned. @returns {Composed} */
    composed() {
      return {
        ...composed,
        parts: composed.parts.map((cp) => { const p = cp.layer === undefined ? byName.get(cp.name) : undefined; return p ? { ...cp, record: p.record } : cp; }),
        wires: composed.wires.map((w, i) => ({ ...w, convert: current.convert[i] })),
        frames: composed.frames.map((f, i) => (current.frames?.[i] ? { ...f, edge: current.frames[i] } : f)),
      };
    },
  };
}

/** The edges whose numbers differ between two plans, or that one has and the other lacks. @param {GraphEdge[]} before @param {GraphEdge[]} after @returns {Moved[]} */
function movedEdges(before, after) {
  const key = (/** @type {GraphEdge} */ e) => `${e.by}|${e.from}|${e.to}`;
  const was = new Map(before.map((e) => [key(e), e]));
  const now = new Set(after.map(key));
  /** @type {Moved[]} */
  const out = [];
  for (const e of after) {
    const b = was.get(key(e));
    if (!b) out.push({ from: e.from, to: e.to, before: null, after: e.edge });
    else if (!sameEdge(b.edge, e.edge)) out.push({ from: e.from, to: e.to, before: b.edge, after: e.edge });
  }
  for (const e of before) if (!now.has(key(e))) out.push({ from: e.from, to: e.to, before: e.edge, after: null });
  return out;
}
