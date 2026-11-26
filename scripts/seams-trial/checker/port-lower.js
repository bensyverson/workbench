// What a Dialect's seams need from one built Program: each output's value lambda lowered as a UI value lambda is
// (kit/define/ui/lower.js: the run's state as `s`, the params as `$`, no effects), and what it gives paired with
// the port's seam (D027); each frame's extent(record) and the Dialect's edges(record), called and checked (D030).
// A grammar's lower(record) appends these, so an example that lowers clean has seams that hold for its Program.

import { lowerProgram } from "../../../kit/lower/index.js";
import { closeLists } from "../../../kit/define/ui/lower.js";
import { pairLocal, printType } from "./seam.js";
import { normalizeEdge } from "./frames.js";

/** @import { Seams } from "./ports.js" */
/** @import { Type } from "../../../kit/ir/ir.js" */
/** @import { Environment, SlotDecl, SlotRef, Member } from "../../../kit/lower/environment.js" */
/** @import { Edge, Box } from "./frames.js" */

/** A diagnostic as a Grammar's lower gives one: the code, the message and a tip; `port` or `frame` names the seam. */
/** @typedef {{ code: string, severity: "error", message: string, tip: string, port?: string, frame?: string, loc?: unknown }} PortDiagnostic */

const NO_PARAMS = "(no params)";

/**
 * Lowers and judges a Dialect's seams against one Program's record.
 * @param {any} dialect  the kit's Dialect @param {Seams} seams @param {Record<string, any>} record
 * @returns {{ diagnostics: PortDiagnostic[], extents: Record<string, Box>, edges: Array<{ from: string, to: string, edge: Edge }> }}
 */
export function lowerPorts(dialect, seams, record) {
  /** @type {PortDiagnostic[]} */
  const diagnostics = [];
  const lambdas = Object.values(seams.out).filter((p) => typeof p.from === "function");
  if (lambdas.length && dialect.stateType) {
    const def = /** @type {Record<string, any>} */ (dialect.def);
    const state = closeLists(/** @type {Type} */ (dialect.stateType));
    const base = /** @type {Environment} */ (dialect.environment(record));
    const paramsObject = typeof def.params?.object === "string" && Object.hasOwn(base.objects, def.params.object) ? def.params.object : NO_PARAMS;
    /** @type {Record<string, Member>} */
    const listMembers = { ...base.list };
    if (!Object.hasOwn(listMembers, "length")) listMembers.length = { kind: "value", t: "f64" };
    /** @type {Map<string, SlotDecl>} */
    const decls = new Map();
    /** @type {Environment} */
    const env = {
      ...base,
      objects: paramsObject === NO_PARAMS ? { ...base.objects, [NO_PARAMS]: { label: "the params ($)", members: {} } } : base.objects,
      list: listMembers,
      slot(ref) { return decls.get(ref.id) ?? base.slot(ref); },
    };
    /** @type {SlotRef[]} */
    const refs = lambdas.map((p) => ({ id: `ports.out.${p.name}.from`, kind: "view", on: String(dialect.name), key: "from" }));
    for (const r of refs) decls.set(r.id, { params: [state, { obj: paramsObject }], returns: "infer", space: "view", forbid: [], may: [], forbidWhy: "an output's lambda only reads the state and the params; it never changes the run" });
    const srcs = lambdas.map((p) => String(p.from));
    const { results } = lowerProgram(env, srcs.map((src, i) => ({ src, slot: refs[i] })), dialect.libraryFor(srcs));
    results.forEach((r, i) => {
      const p = lambdas[i];
      const errors = r.diagnostics.filter((d) => d.severity === "error");
      for (const d of errors) diagnostics.push({ code: d.code, severity: "error", message: `output '${p.name}', from: ${d.message}`, tip: d.tip ?? "", port: p.name, loc: d.loc });
      if (errors.length) return;
      const why = pairLocal(p.seam, /** @type {Type} */ (r.returns));
      if (why) diagnostics.push({ code: "D027", severity: "error", message: `output '${p.name}': its lambda gives ${printType(/** @type {Type} */ (r.returns))}, which does not pair with its seam: ${why}`, tip: `make the lambda give what ${p.seamText} pairs with, or change the seam`, port: p.name });
    });
  }

  /** @type {Record<string, Box>} */
  const extents = {};
  for (const f of Object.values(seams.frames)) {
    if (!f.extent) continue;
    let v;
    try { v = f.extent(record); } catch (e) {
      diagnostics.push({ code: "D030", severity: "error", message: `frame '${f.name}': extent(record) threw: ${/** @type {Error} */ (e)?.message ?? String(e)}`, tip: "read only what the record always has", frame: f.name });
      continue;
    }
    const box = boxOf(v, f.dims);
    if (box) extents[f.name] = box;
    else diagnostics.push({ code: "D030", severity: "error", message: `frame '${f.name}': extent(record) gave ${JSON.stringify(v) ?? String(v)}, not { min, max }, each ${f.dims} number${f.dims === 1 ? "" : "s"} with max above min on every axis (the box the frame spans)`, tip: f.dims === 2 ? "return { min: [0, 0], max: [width, height] }" : `return { min: [${Array(f.dims).fill(0).join(", ")}], max: [${Array(f.dims).fill("…").join(", ")}] }`, frame: f.name });
  }

  /** @type {Array<{ from: string, to: string, edge: Edge }>} */
  const edges = [];
  if (seams.edges) {
    let v;
    try { v = seams.edges(record); } catch (e) {
      diagnostics.push({ code: "D030", severity: "error", message: `edges(record) threw: ${/** @type {Error} */ (e)?.message ?? String(e)}`, tip: "read only what the record always has" });
      v = [];
    }
    if (!Array.isArray(v)) diagnostics.push({ code: "D030", severity: "error", message: `edges(record) gave ${JSON.stringify(v) ?? String(v)}, not an array of { from, to, scale, offset }`, tip: 'return [{ from: "cell", to: "px", scale: 16, offset: 8 }]' });
    else v.forEach((e, i) => {
      const why = edgeProblem(seams, e);
      if (typeof why === "string") diagnostics.push({ code: "D030", severity: "error", message: `edges(record)[${i}]: ${why}`, tip: 'return [{ from: "cell", to: "px", scale: 16, offset: 8 }]' });
      else edges.push(why);
    });
  }
  return { diagnostics, extents, edges };
}

/**
 * One edge edges(record) gave, read: what is wrong with it, or the edge between two of the Dialect's frames.
 * @param {Seams} seams @param {unknown} e @returns {string | { from: string, to: string, edge: Edge }}
 */
function edgeProblem(seams, e) {
  if (e === null || typeof e !== "object") return `${JSON.stringify(e)} is not { from, to, scale, offset }`;
  const { from, to, ...rest } = /** @type {Record<string, unknown>} */ (e);
  const ff = typeof from === "string" ? seams.frames[from] : undefined, ft = typeof to === "string" ? seams.frames[to] : undefined;
  if (!ff || !ft) return `from and to name two of the Dialect's own frames (${Object.keys(seams.frames).join(", ") || "it declares none"}), not ${JSON.stringify(from)} and ${JSON.stringify(to)}`;
  if (ff === ft) return `an edge relates two frames, not '${ff.name}' to itself`;
  if (ff.dims !== ft.dims) return `'${ff.name}' has ${ff.dims} dims and '${ft.name}' ${ft.dims}; an edge joins frames of one dims`;
  const n = normalizeEdge(rest, ff.dims);
  return n.ok ? { from: ff.name, to: ft.name, edge: n.edge } : n.error;
}

/** An extent as a box, or null when it is not one: { min, max }, each `dims` finite numbers, max above min. @param {unknown} v @param {number} dims @returns {Box | null} */
function boxOf(v, dims) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const { min, max, ...rest } = /** @type {Record<string, unknown>} */ (v);
  const axes = (/** @type {unknown} */ a) => Array.isArray(a) && a.length === dims && a.every((x) => typeof x === "number" && Number.isFinite(x));
  if (Object.keys(rest).length || !axes(min) || !axes(max)) return null;
  const lo = /** @type {number[]} */ (min), hi = /** @type {number[]} */ (max);
  return lo.every((x, i) => hi[i] > x) ? { min: [...lo], max: [...hi] } : null;
}
