// The layer: a built-in part, like the page, that draws several Draw outputs as one picture, each over the one
// before (Ben's ruling of 2026-11-27, "Rulings" 1 of the layer and package tests plan; README, "Layers"). A glue
// makes one with `layer(<name>, <output>, <output>, ...)`, bottom first, or with the shorthand
// `.show(<output>, <output>, ...)`, which makes one named `layers`. The kit knows the producers, so it derives what a
// composer would copy: the output's max is the sum of the producers' built maxes, each input's ceiling is its
// producer's, and its frame is the bottom producer's. A layer has no step, state, runtime or params: kit/run
// concatenates its inputs' converted lists wherever its output is read. This module makes layers and judges them
// at composition (registerLayers, then planLayers once the frame graph is whole); analyze.js calls both.

import { sideOf, paramSideOf, isHandle, handleText } from "../define/handles.js";
import { printSeam } from "../seam/index.js";
import { glueSite } from "./site.js";

/** @import { Handle } from "../define/handles.js" */
/** @import { Loc } from "../parse/ast.js" */
/** @import { Side } from "./compose.js" */

/** The Dialect name a layer's part entry carries in the composed record. */
export const LAYER = "layer";
/** A layer's one output. */
export const LAYER_VIEW = "view";
/** The name of the layer `.show(<output>, <output>, ...)` makes. */
export const SHORTHAND = "layers";

/**
 * A layer as the glue made it: its name and arguments as given, unjudged, the call that made it (for messages), where,
 * and the identity its handles carry as their `program`.
 * @typedef {{ name: unknown, inputs: unknown[], call: string, at: { file: string, loc: Loc }, program: { declared(): Map<string, unknown> }, builder: object }} Layer
 */

/** Each layer by its builder, and by its handles' program. */
const byBuilder = new WeakMap();
const byProgram = new WeakMap();

/**
 * A layer part over two or more Draw outputs, in painter's order: the first is drawn first, at the bottom. Its one
 * output is `.out.view`; it has no inputs, frames or params to name (S111). Judged when a composition names it.
 * @param {string} name @param {...unknown} outputs
 */
export function layer(name, ...outputs) {
  return makeLayer(name, outputs, glueSite(), `layer(${typeof name === "string" ? JSON.stringify(name) : String(name)}, …)`);
}

/**
 * @param {unknown} name @param {unknown[]} inputs @param {{ file: string, loc: Loc }} at @param {string} call  how messages name the call
 * @returns {any}
 */
export function makeLayer(name, inputs, at, call) {
  const program = { declared: () => new Map() };
  const part = typeof name === "string" ? name : String(name);
  const seams = /** @type {any} */ ({ out: { [LAYER_VIEW]: { seamText: null } }, in: {}, frames: {} });
  const builder = Object.freeze({
    out: sideOf(program, "out", seams, part, LAYER),
    in: sideOf(program, "in", seams, part, LAYER),
    frame: sideOf(program, "frame", seams, part, LAYER),
    param: paramSideOf(program, part, LAYER),
    toString: () => `[layer ${part}]`,
  });
  /** @type {Layer} */
  const l = { name, inputs: [...inputs], call, at, program, builder };
  byBuilder.set(builder, l);
  byProgram.set(program, l);
  return builder;
}

/** The layer a builder is, or undefined. @param {unknown} v @returns {Layer | undefined} */
export const layerOf = (v) => (v !== null && typeof v === "object" ? byBuilder.get(v) : undefined);
/** The layer a handle is of, or undefined. @param {unknown} h @returns {Layer | undefined} */
export const layerOfHandle = (h) => (isHandle(h) ? byProgram.get(h.program) : undefined);

/**
 * The layers a glue's calls name, in order of first mention, each after the layers among its arguments: a layer joins
 * the composition at the first call that names it (`.part`, `.show`, a `.wire` or `.frame` naming one of its handles,
 * or another layer's argument).
 * @param {Array<{ kind: string, [k: string]: any }>} calls @returns {Layer[]}
 */
export function layersNamed(calls) {
  /** @type {Layer[]} */
  const out = [];
  const seen = new Set();
  /** @param {Layer | undefined} l */
  const mention = (l) => {
    if (!l || seen.has(l)) return;
    seen.add(l);
    for (const a of l.inputs) mention(layerOfHandle(a));
    out.push(l);
  };
  for (const c of calls) {
    if (c.kind === "part" || c.kind === "show") mention(layerOf(c.value));
    else if (c.kind === "wire") { mention(layerOfHandle(c.from)); mention(layerOfHandle(c.to)); }
    else if (c.kind === "frame") { mention(layerOfHandle(c.a)); mention(layerOfHandle(c.b)); }
  }
  return out;
}

/**
 * What a layer is once judged: its inputs (the producers' output handles, bottom first), its output's max and seam,
 * and its frame, the bottom producer's (`<part>.<frame>`, down through a layer at the bottom).
 * @typedef {{ inputs: Handle[], max: number, frameNode: string }} Judged
 */

/**
 * The context analyze.js gives: the parts so far (a layer's Part is added to them), the diagnostics, and its helpers.
 * @typedef {object} LayerContext
 * @property {Map<object, any>} parts @property {Map<string, any>} byName @property {Set<any>} broken
 * @property {(at: any, code: string, message: string, fix: string, sides?: { from?: Side, to?: Side }) => void} add
 * @property {(h: unknown, want: "out", at: any, call: string, sides: { from?: Side, to?: Side }) => any} resolve
 * @property {(h: Handle) => Side} side @property {(p: any) => Side} partSide @property {(h: unknown) => Side | null} anySide
 * @property {(p: any, f: string) => string} node
 */

/**
 * Judges each layer the calls name and adds it as a part: its name (S102, S101), its arguments (S102 for fewer than
 * two, a non-output, a part not added, one given twice; S111 for an output its part lacks; S404 for an output that is
 * not a Draw list), and `.part` of it twice (S102). A layer with a problem, or over a producer that does not build,
 * is not judged further, and its wires are not either. The conversions wait for the frame graph (planLayers).
 * @param {Array<{ kind: string, at: any, [k: string]: any }>} calls @param {LayerContext} ctx
 */
export function registerLayers(calls, ctx) {
  for (const l of layersNamed(calls)) {
    const name = typeof l.name === "string" ? l.name : String(l.name);
    const part = { name, program: l.program, dialect: null, seams: { out: {}, in: {}, frames: {} }, dialectName: LAYER, record: {}, extents: {}, edges: [], at: l.at, layer: /** @type {Judged | null} */ (null) };
    ctx.parts.set(l.program, part);
    let ok = true;
    const partCalls = calls.filter((c) => c.kind === "part" && c.value === l.builder);
    if (partCalls.length > 1) { ctx.add(partCalls[1].at, "S102", `.part(${name}) is called twice with one layer`, "add each part once"); }
    if (typeof l.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(l.name)) { ctx.add(l.at, "S102", `${l.call}: a layer's name is lowercase letters, digits and -, not ${JSON.stringify(l.name) ?? String(l.name)}`, 'layer("<name>", <part>.out.<output>, <part>.out.<output>)'); ok = false; }
    const first = ctx.byName.get(name);
    if (first) {
      const fix = name === SHORTHAND && l.call.startsWith(".show") ? `name the layer: layer("<name>", ...), imported from kit/compose beside compose, then .show(<layer>)` : `rename one: layer("${name}2", ...)`;
      ctx.add(l.at, "S101", `two parts are named '${name}' (${first.dialectName} at line ${first.at.loc.start.line}, and this layer); a part's name is its address, unique in the composition`, fix, { from: ctx.partSide(first), to: ctx.partSide(part) });
      ctx.broken.add(part);
      continue;
    }
    ctx.byName.set(name, part);
    if (l.inputs.length < 2) {
      ctx.add(l.at, "S102", `${l.call}: a layer takes two or more Draw outputs, bottom first; it was given ${l.inputs.length === 1 ? "one" : "none"}`, "pass two or more outputs, or show the one part whose picture it is: .show(<part>)");
      ok = false;
    }
    /** @type {Handle[]} */
    const inputs = [];
    let unjudged = false;
    const seen = new Set();
    for (const a of l.inputs) {
      const at = ctx.anySide(a);
      const p = ctx.resolve(a, "out", l.at, l.call, at ? { from: at } : {});
      // a producer that does not build stops with its own diagnostics: its layer is not judged, as no consumer of it is
      if (!p) { if (isHandle(a) && a.known && a.side === "out" && ctx.broken.has(ctx.parts.get(a.program))) unjudged = true; else ok = false; continue; }
      const h = /** @type {Handle} */ (a);
      if (seen.has(handleText(h))) { ctx.add(l.at, "S102", `${l.call}: ${handleText(h)} is given twice; drawing one list twice doubles its count for nothing`, "give each output once (the same output may feed several layers)", { from: ctx.side(h) }); ok = false; continue; }
      seen.add(handleText(h));
      const out = p.seams.out[h.name];
      if (out.seam.kind !== "draw") { ctx.add(l.at, "S404", `${l.call}: ${handleText(h)} (${out.seamText}) is not a Draw list; a layer draws Draw outputs only`, "pass outputs whose seam is Draw<n>@<frame>", { from: ctx.side(h) }); ok = false; continue; }
      inputs.push(h);
    }
    if (!ok || unjudged) { ctx.broken.add(part); continue; }
    const seamsOf = (/** @type {Handle} */ h) => /** @type {any} */ (ctx.parts.get(h.program)).seams.out[h.name].seam;
    const max = inputs.reduce((n, h) => n + seamsOf(h).max, 0);
    const bottom = inputs[0];
    const frame = seamsOf(bottom).frame;
    const seam = { kind: "draw", max, frame };
    part.layer = { inputs, max, frameNode: ctx.node(ctx.parts.get(bottom.program), frame) };
    part.seams = { out: { [LAYER_VIEW]: { name: LAYER_VIEW, seam, seamText: printSeam(/** @type {any} */ (seam)) } }, in: {}, frames: {} };
  }
}

/**
 * S111 for a handle of a layer that names no output, input, frame or param of it: a layer's only handle is
 * `<layer>.out.view`. The fix says what to do instead.
 * @param {any} p  the layer's Part @param {Handle} h @returns {{ message: string, fix: string }}
 */
export function layerHandleProblem(p, h) {
  const bottom = p.layer ? p.layer.frameNode.replace(".", ".frame.") : "<bottom part>.frame.<frame>";
  switch (h.side) {
    case "in": return { message: `layer '${p.name}' has no input '${h.name}': its inputs are the outputs it was made with, bottom first`, fix: `pass the output to layer: layer("${p.name}", <output>, <output>, ...), in painter's order` };
    case "frame": return { message: `layer '${p.name}' has no frame '${h.name}': a layer's frame is its bottom producer's`, fix: `relate the bottom producer's frame instead: .frame(${bottom}, <part>.frame.<frame>, { scale, offset })` };
    case "param": return { message: `layer '${p.name}' has no param '${h.name}': a layer has no params`, fix: "set the param on the part that draws the picture" };
    default: return { message: `layer '${p.name}' has no output '${h.name}'. Its outputs: ${LAYER_VIEW}`, fix: `use ${p.name}.out.${LAYER_VIEW}` };
  }
}

/**
 * Each judged layer's inputs as wires, `<part>.out.<output> → <layer>.in.<i>`, `<i>` from 0 at the bottom: the bottom
 * one unchanged (already in the layer's frame), every other one a `draw` conversion from its producer's frame to the
 * bottom frame, by the frame graph (S251 when no path joins them; none when a refused .frame meant to). They take no
 * options, so they are `fixed`: the cycle check's fix never names one.
 * @param {LayerContext & { graph: import("../seam/frames.js").FrameGraph, refusedPairs: Set<string>, frameName: (id: string) => string, extentOf: (id: string) => unknown, conversion: (fromId: string, toId: string, path: import("../seam/frames.js").Path) => any }} ctx
 * @returns {any[]} the wires, in analyze.js's Wire shape
 */
export function planLayers(ctx) {
  /** @type {any[]} */
  const wires = [];
  for (const p of ctx.parts.values()) {
    if (!p.layer || ctx.broken.has(p)) continue;
    const judged = /** @type {Judged} */ (p.layer);
    const toId = judged.frameNode;
    judged.inputs.forEach((h, i) => {
      const producer = ctx.parts.get(h.program);
      const seam = producer.seams.out[h.name];
      const to = { program: p.program, part: p.name, dialect: LAYER, side: "in", name: String(i), known: true };
      const wire = { from: h, to, into: "in", at: p.at, convert: /** @type {any[]} */ ([]), rename: {}, set: {}, delay: false, overflow: null, dropped: [], fill: {}, ok: true, fixed: true };
      wires.push(wire);
      const fromId = ctx.node(producer, seam.seam.frame);
      if (fromId === toId) return;
      const path = ctx.graph.path(fromId, toId);
      if (path) { wire.convert.push(ctx.conversion(fromId, toId, path)); return; }
      wire.ok = false;
      if (ctx.refusedPairs.has(`${fromId}|${toId}`)) return;
      const fa = fromId.replace(".", ".frame."), fb = toId.replace(".", ".frame.");
      const bottom = handleText(judged.inputs[0]);
      const sides = { from: ctx.side(h), to: { ...ctx.partSide(p), port: `in.${i}`, seam: seam.seamText } };
      const fit = ctx.extentOf(fromId) && ctx.extentOf(toId);
      ctx.add(p.at, "S251", `${handleText(h)} cannot feed ${p.name}.in.${i}: the value is a draw list in ${ctx.frameName(fromId)}; the layer draws in ${ctx.frameName(toId)}, its bottom producer's (${bottom}), and no frame path joins them`, fit ? `write .frame(${fa}, ${fb}, "fit"), or give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })` : `give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … }) ("fit" needs both frames to declare an extent)`, sides);
    });
  }
  return wires;
}
