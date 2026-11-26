// What a Dialect's seams need from one built Program: each output's value lambda lowered as a UI value lambda is
// (kit/define/ui/lower.js: the run's state as `s`, the params as `$`, no effects), and what it gives paired with
// the port's seam (D027); each frame's extent(record) and the Dialect's edges(record), called and checked (D030).
// A grammar's lower(record) appends these, so an example that lowers clean has seams that hold for its Program.
// Each is the Dialect's mistake, not the Program's, so it is placed at the defineDialect call and names its port
// or frame.

import { lowerProgram } from "../lower/index.js";
import { closeLists } from "./ui/lower.js";
import { pairLocal, printType, normalizeEdge } from "../seam/index.js";
import { parseLambda } from "../parse/index.js";
import { lowerDraws } from "./draw-lower.js";

/** @import { Seams } from "./define.js" */
/** @import { Type } from "../ir/ir.js" */
/** @import { Environment, SlotDecl, SlotRef, Member } from "../lower/environment.js" */
/** @import { Edge, Box } from "../seam/frames.js" */

/**
 * A seam diagnostic as a Grammar's lower gives one: at the Dialect's defineDialect call; `port` or `frame` names the
 * seam, and `lambdaLoc` is where inside an output's lambda a lowering error sits.
 * @typedef {{ code: string, severity: "error", message: string, tip: string, file: string, loc: import("../parse/ast.js").Loc, range: [number, number], port?: string, frame?: string, lambdaLoc?: unknown }} PortDiagnostic
 */
/** What a Program's seams lowered to: each frame's box, the Dialect's edges, each output lambda's result. */
/** @typedef {{ extents: Record<string, Box>, edges: Array<{ from: string, to: string, edge: Edge }>, outputs: Record<string, import("../lower/index.js").LowerResult>, draws: Record<string, import("./draw-lower.js").LoweredDraw>, drawHelpers: import("../lower/index.js").HelperResult[] }} LoweredSeams */

const NO_PARAMS = "(no params)";

/**
 * Lowers and judges a Dialect's seams against one Program's record.
 * @param {any} dialect  the kit's Dialect @param {Record<string, any>} record
 * @returns {LoweredSeams & { diagnostics: PortDiagnostic[] }}
 */
export function lowerPorts(dialect, record) {
  /** @type {Seams} */
  const seams = dialect.seams;
  const at = { file: dialect.site?.file ?? "", loc: dialect.site?.loc ?? { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }, range: /** @type {[number, number]} */ ([0, 0]) };
  /** @type {PortDiagnostic[]} */
  const diagnostics = [];
  const push = (/** @type {Omit<PortDiagnostic, "file" | "loc" | "range">} */ d) => diagnostics.push({ ...d, ...at });
  /** @type {LoweredSeams["outputs"]} */
  const outputs = {};
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
      for (const d of errors) push({ code: d.code, severity: "error", message: `the ${dialect.name} Dialect's output '${p.name}', from, line ${d.loc.start.line}: ${d.message}`, tip: d.tip ?? "", port: p.name, lambdaLoc: d.loc });
      if (errors.length) return;
      outputs[p.name] = r;
      const why = pairLocal(p.seam, builtVector(p.seam, String(p.from), /** @type {Type} */ (r.returns)));
      if (why) push({ code: "D027", severity: "error", message: `the ${dialect.name} Dialect's output '${p.name}': its lambda gives ${printType(/** @type {Type} */ (r.returns))}, which does not pair with its seam: ${why}`, tip: `make the lambda give what ${p.seamText} pairs with, or change the seam`, port: p.name });
    });
  }

  /** @type {Record<string, Box>} */
  const extents = {};
  for (const f of Object.values(seams.frames)) {
    if (!f.extent) continue;
    let v;
    try { v = f.extent(record); } catch (e) {
      push({ code: "D030", severity: "error", message: `the ${dialect.name} Dialect's frame '${f.name}': extent(record) threw: ${/** @type {Error} */ (e)?.message ?? String(e)}`, tip: "read only what the record always has", frame: f.name });
      continue;
    }
    const box = boxOf(v, f.dims);
    if (box) extents[f.name] = box;
    else push({ code: "D030", severity: "error", message: `the ${dialect.name} Dialect's frame '${f.name}': extent(record) gave ${JSON.stringify(v) ?? String(v)}, not { min, max }, each ${f.dims} number${f.dims === 1 ? "" : "s"} with max above min on every axis (the box the frame spans)`, tip: f.dims === 2 ? "return { min: [0, 0], max: [width, height] }" : `return { min: [${Array(f.dims).fill(0).join(", ")}], max: [${Array(f.dims).fill("…").join(", ")}] }`, frame: f.name });
  }

  /** @type {Array<{ from: string, to: string, edge: Edge }>} */
  const edges = [];
  if (seams.edges) {
    let v;
    try { v = seams.edges(record); } catch (e) {
      push({ code: "D030", severity: "error", message: `the ${dialect.name} Dialect's edges(record) threw: ${/** @type {Error} */ (e)?.message ?? String(e)}`, tip: "read only what the record always has" });
      v = [];
    }
    if (!Array.isArray(v)) push({ code: "D030", severity: "error", message: `the ${dialect.name} Dialect's edges(record) gave ${JSON.stringify(v) ?? String(v)}, not an array of { from, to, scale, offset }`, tip: 'return [{ from: "cell", to: "px", scale: 16, offset: 8 }]' });
    else v.forEach((e, i) => {
      const why = edgeProblem(seams, e);
      if (typeof why === "string") push({ code: "D030", severity: "error", message: `the ${dialect.name} Dialect's edges(record)[${i}]: ${why}`, tip: 'return [{ from: "cell", to: "px", scale: 16, offset: 8 }]' });
      else edges.push(why);
    });
  }
  const { draws, helpers: drawHelpers } = lowerDraws(dialect, record, push);
  return { diagnostics, extents, edges, outputs, draws, drawHelpers };
}

/**
 * What an output lambda gives, as its seam pairs it: an array literal of a point's or vector's dims numbers
 * (`(s) => [s.player.x, s.player.y]`, ruled 2026-11-26) is a vector of them. Lowering types the literal a list,
 * whose max is only a bound, so the lambda's body itself must be the literal, with exactly that many items.
 * @param {import("../seam/seam.js").Seam} seam @param {string} src @param {Type} returns
 * @returns {Type}
 */
function builtVector(seam, src, returns) {
  if ((seam.kind !== "point" && seam.kind !== "vector") || seam.dims === 1) return returns;
  const items = typeof returns === "object" && "list" in returns && (returns.list === "f64" || (typeof returns.list === "object" && "scalar" in returns.list && returns.list.of === "f64"));
  if (!items) return returns;
  const parsed = parseLambda(src);
  const body = parsed.ok && parsed.ast ? /** @type {any} */ (parsed.ast).body : null;
  const literal = body?.type === "ArrayExpression" && body.elements.length === seam.dims && body.elements.every((/** @type {any} */ e) => e && e.type !== "SpreadElement");
  return literal ? { vec: seam.dims, of: "f64" } : returns;
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
