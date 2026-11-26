// The stand-in for the draft's kit/compose: `compose(name).part(builder).frame(a, b, edge | "fit").wire(out, in)
// .show(part)`, then `.check()` (every S diagnostic at once) or `.build()` (the composed record). Each part is a
// whole Program built and lowered by its own Grammar; the composition adds the frame graph (the parts' own edges,
// then the glue's), the wires with their conversion plans, and diagnostics that name both sides.
// No clocks, scheduling or running: the draft leaves those to f2dMku.

import { BuildError } from "../../../kit/define/index.js";
import { programOf } from "../../../kit/define/grammar.js";
import { didYouMean } from "../../../kit/define/codes.js";
import { builders, programs, dialects, registry, packageOf } from "./registry.js";
import { isHandle, partName } from "./handles.js";
import { compareSeams } from "./seam.js";
import { lowerPorts } from "./port-lower.js";
import { FrameGraph, normalizeEdge, fitEdge, edgeText, convertText, uniform } from "./frames.js";
import { siteIn, hideStandInFrames } from "./stack.js";

hideStandInFrames();

/** @import { Handle } from "./handles.js" */
/** @import { Seams } from "./ports.js" */
/** @import { Side } from "./codes.js" */
/** @import { Edge, Path } from "./frames.js" */

/**
 * One S, B, L or D diagnostic of a composition: at a file of the hand-in and a line, with both sides for a wire or
 * an edge.
 * @typedef {{ code: string, message: string, file: string, line: number, from?: Side, to?: Side, fix: string }} ComposeDiagnostic
 */
/** @typedef {{ field: string, kind: "point" | "vector" | "quantity", from: string, to: string, scale: number[], offset: number[], text: string, glue: boolean }} Conversion */
/**
 * A part as the analysis sees it.
 * @typedef {{ name: string, program: any, builder: any, dialect: any, seams: Seams, dialectName: string, version: string, record: Record<string, any> | null, extents: Record<string, import("./frames.js").Box>, line: number, file: string }} Part
 */
/** @typedef {{ from: Handle, to: Handle, line: number, file: string, convert: Conversion[], dropped: string[], ok: boolean }} Wire */
/** @typedef {{ name: string, parts: Part[], wires: Wire[], show: Part | null, diagnostics: ComposeDiagnostic[] }} Analysis */

/** The module scope run() would give the glue's lambdas; the checker sets it before calling check or build. */
export const composeSession = { /** @type {Record<string, unknown>} */ options: {} };

/** What a composition made with this stand-in is, for the checker. */
const MADE = new WeakSet();
/** @param {unknown} v */
export const isComposition = (v) => v !== null && typeof v === "object" && MADE.has(v);

/** A composition that does not build: every diagnostic. */
export class ComposeError extends Error {
  /** @param {ComposeDiagnostic[]} diagnostics */
  constructor(diagnostics) {
    super(diagnostics.map((d) => `${d.file}:${d.line}: ${d.code} ${d.message}`).join("\n"));
    this.name = "ComposeError";
    this.diagnostics = diagnostics;
  }
}

/** Where the glue made a call: its file and line in the hand-in. */
const here = () => siteIn(registry.dirUrl) ?? { file: "workbench.js", line: 1 };

/**
 * Starts a composition.
 * @param {string} name
 */
export function compose(name) {
  const start = here();
  /** @type {Array<{ kind: "part", value: unknown } | { kind: "frame", a: unknown, b: unknown, edge: unknown } | { kind: "wire", from: unknown, to: unknown } | { kind: "show", value: unknown }>} */
  const calls = [];
  /** @type {Array<{ file: string, line: number }>} */
  const sites = [];
  const push = (/** @type {any} */ c) => { calls.push(c); sites.push(here()); return api; };
  const api = Object.freeze({
    /** @param {unknown} builder */
    part: (builder) => push({ kind: "part", value: builder }),
    /** @param {unknown} a @param {unknown} b @param {unknown} edge */
    frame: (a, b, edge) => push({ kind: "frame", a, b, edge }),
    /** @param {unknown} from @param {unknown} to */
    wire: (from, to) => push({ kind: "wire", from, to }),
    /** @param {unknown} part */
    show: (part) => push({ kind: "show", value: part }),
    check: () => analyze(name, start, calls, sites).diagnostics,
    build: () => {
      const a = analyze(name, start, calls, sites);
      if (a.diagnostics.length) throw new ComposeError(a.diagnostics);
      return recordOf(a);
    },
    /** The checker's view: the parts, wires and diagnostics. */
    analyze: () => analyze(name, start, calls, sites),
  });
  MADE.add(api);
  return api;
}

/** The composed record (the draft: wires[i].convert is data, applied by the scheduler). @param {Analysis} a */
export function recordOf(a) {
  return {
    name: a.name,
    parts: a.parts.map((p) => ({ name: p.name, dialect: p.dialectName, version: p.version, record: p.record })),
    wires: a.wires.filter((w) => w.ok).map((w) => ({ from: handleText(w.from), to: handleText(w.to), convert: w.convert.map(({ field, kind, from, to, scale, offset }) => ({ field, kind, from, to, scale, offset })), dropped: w.dropped })),
    show: a.show?.name ?? null,
  };
}

/** @param {Handle} h */
const handleText = (h) => `${partName(h.program)}.${h.side}.${h.name}`;

/**
 * Checks a composition's calls in order: the parts (each built and lowered by its Grammar), the frame graph, the
 * wires, the required inputs, the shown part, and the handles read as values.
 * @param {string} name @param {{ file: string, line: number }} start
 * @param {any[]} calls @param {Array<{ file: string, line: number }>} sites
 * @returns {Analysis}
 */
function analyze(name, start, calls, sites) {
  /** @type {ComposeDiagnostic[]} */
  const out = [];
  /** @param {{ file: string, line: number }} at @param {string} code @param {string} message @param {string} fix @param {{ from?: Side, to?: Side }} [sides] */
  const add = (at, code, message, fix, sides = {}) => out.push({ code, message, file: at.file, line: at.line, ...sides, fix });
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) add(start, "S102", `compose(${JSON.stringify(name)}): a composition's name is the workbench's, lowercase letters, digits and -`, 'compose("coin-bursts")');

  /** @type {Map<object, Part>} */
  const parts = new Map();
  /** @type {Map<string, Part>} */
  const byName = new Map();
  /** @type {Set<Part>} */
  const broken = new Set();
  calls.forEach((c, i) => {
    if (c.kind !== "part") return;
    const at = sites[i];
    const program = programOf(c.value);
    const builder = program ? programs.get(program) : undefined;
    const info = builder ? builders.get(builder) : undefined;
    if (!program || !builder || !info) { add(at, "S102", `.part(${describe(c.value)}): a part is a Program built with a package's Grammar, such as maze("level").grid(…)…`, "pass the builder chain a package's Grammar returned"); return; }
    if (parts.has(program)) { add(at, "S102", `.part(${partName(program)}) is called twice with one Program`, "add each part once"); return; }
    const dialect = info.dialect;
    const pkg = packageOf(dialects.get(dialect)?.file ?? "");
    /** @type {Part} */
    const part = { name: partName(program), program, builder, dialect, seams: info.seams, dialectName: String(dialect.name), version: pkg?.version ?? "?", record: null, extents: {}, line: at.line, file: at.file };
    parts.set(program, part);
    const first = byName.get(part.name);
    if (first) { add(at, "S101", `two parts are named '${part.name}' (${first.dialectName} at line ${first.line}, and this ${part.dialectName}); a part's name is its address, unique in the composition`, `rename one: ${part.dialectName}("${part.name}2")`, { from: partSide(first), to: partSide(part) }); broken.add(part); return; }
    byName.set(part.name, part);
    // the part, built and lowered by its own Grammar exactly as if it stood alone
    try {
      part.record = program.build(composeSession.options);
    } catch (e) {
      if (!(e instanceof BuildError)) throw e;
      for (const d of /** @type {any[]} */ (e.diagnostics)) add(placed(d, at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, d.tip ?? "");
      broken.add(part);
      return;
    }
    const lowered = /** @type {any} */ (builder).lower(part.record);
    const errors = lowered.diagnostics.filter((/** @type {any} */ d) => d.severity === "error" || d.severity === undefined);
    for (const d of errors) add(placed(d, at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, d.tip ?? "");
    if (errors.length) { broken.add(part); return; }
    part.extents = lowerPorts(dialect, info.seams, part.record).extents;
  });

  /** A side of a handle, for a diagnostic. @param {Handle} h @returns {Side} */
  const side = (h) => {
    const p = /** @type {Part} */ (parts.get(h.program));
    if (h.side === "frame") return { part: p.name, dialect: p.dialectName, version: p.version, frame: h.name, dims: p.seams.frames[h.name]?.dims };
    const port = h.side === "out" ? p.seams.out[h.name] : p.seams.in[h.name];
    return { part: p.name, dialect: p.dialectName, version: p.version, port: `${h.side}.${h.name}`, seam: port?.seamText };
  };
  /** A part's side, with no port: S101's, and a handle's whose port the part lacks. @param {Part} p @returns {Side} */
  function partSide(p) { return { part: p.name, dialect: p.dialectName, version: p.version }; }
  /** The side of whatever a handle is, as far as it is known: null for a handle of no part in the composition. @param {unknown} h @returns {Side | null} */
  const anySide = (h) => {
    if (!isHandle(h)) return null;
    const p = parts.get(h.program);
    if (!p) return null;
    if (h.known) return side(h);
    const names = Object.keys(h.side === "out" ? p.seams.out : h.side === "in" ? p.seams.in : p.seams.frames);
    return { ...partSide(p), ...(h.side === "frame" ? { frame: h.name } : { port: `${h.side}.${h.name}` }), has: names };
  };
  /** The sides of a two-handle call, those that are known, keyed as the call places them. @param {unknown} a @param {unknown} b */
  const callSides = (a, b) => {
    const from = anySide(a), to = anySide(b);
    return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
  };
  /**
   * The handle's part, or a diagnostic carrying whatever sides the call has.
   * @param {unknown} h @param {"out" | "in" | "frame"} want @param {{ file: string, line: number }} at @param {string} call @param {{ from?: Side, to?: Side }} sides
   */
  const resolve = (h, want, at, call, sides) => {
    if (!isHandle(h)) { add(at, "S102", `${call}: ${describe(h)} is not ${want === "frame" ? "a frame handle (part.frame.name)" : `an ${want === "out" ? "output" : "input"} handle (part.${want}.name)`}`, want === "frame" ? ".frame(level.frame.cell, fx.frame.px, \"fit\")" : ".wire(level.out.picked, fx.in.burst)", sides); return null; }
    const p = parts.get(h.program);
    if (!p) { add(at, "S102", `${call}: ${handleText(h)} is a handle of a part not in the composition`, `add it first: .part(${partName(h.program)})`, sides); return null; }
    if (h.side !== want) { add(at, "S102", `${call}: ${handleText(h)} is ${h.side === "frame" ? "a frame" : h.side === "out" ? "an output" : "an input"}, and this place takes ${want === "frame" ? "a frame" : want === "out" ? "an output" : "an input"}`, want === "frame" ? ".frame(a.frame.x, b.frame.y, edge)" : ".wire(producer.out.x, consumer.in.y)", sides); return null; }
    if (!h.known) {
      const names = Object.keys(want === "out" ? p.seams.out : want === "in" ? p.seams.in : p.seams.frames);
      const what = want === "out" ? "output" : want === "in" ? "input" : "frame";
      add(at, "S111", `${call}: part '${p.name}' (${p.dialectName} ${p.version}) has no ${what} '${h.name}'.${didYouMean(h.name, names)} Its ${what}s: ${names.length ? names.join(", ") : "none"}`, names.length ? `use one of: ${names.map((n) => `${p.name}.${want}.${n}`).join(", ")}` : `the ${p.dialectName} package declares no ${what}s`, sides);
      return null;
    }
    return broken.has(p) ? null : p;
  };

  // the frame graph: every part's frames, its Dialect's own edges, then the glue's in order
  const graph = new FrameGraph();
  const node = (/** @type {Part} */ p, /** @type {string} */ f) => `${p.name}.${f}`;
  /** A frame as messages write it: maze.cell. @param {string} id */
  const frameName = (id) => { const [pn, f] = id.split("."); return `${byName.get(pn)?.dialectName ?? pn}.${f}`; };
  /** @param {Path} path */
  const pathText = (path) => path.steps.map((s) => `${frameName(s.backward ? s.to : s.from)} → ${frameName(s.backward ? s.from : s.to)} ${s.glue ? `(.frame at line ${s.line})` : `(${s.by}'s edges)`}${s.backward ? " run backward" : ""} ${edgeText(s.edge)}`).join("; ");
  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const f of Object.values(p.seams.frames)) graph.addNode(node(p, f.name), f.dims);
    for (const e of lowerPorts(p.dialect, p.seams, /** @type {any} */ (p.record)).edges) {
      const clash = graph.add({ from: node(p, e.from), to: node(p, e.to), edge: e.edge, by: p.dialectName });
      if (clash) add({ file: p.file, line: p.line }, "S253", `part '${p.name}': the ${p.dialectName} Dialect's edges relate ${frameName(node(p, e.from))} to ${frameName(node(p, e.to))} twice, and the two disagree: ${pathText(clash.existing)}, against ${edgeText(e.edge)}`, `fix the ${p.dialectName} package's edges(record)`);
    }
  }
  /** The frame pairs a refused .frame meant to join: a wire across one is not also S251, which would only repeat it. @type {Set<string>} */
  const refusedPairs = new Set();
  calls.forEach((c, i) => {
    if (c.kind !== "frame") return;
    const at = sites[i];
    const call = ".frame";
    const both = callSides(c.a, c.b);
    const pa = resolve(c.a, "frame", at, call, both), pb = resolve(c.b, "frame", at, call, both);
    if (!pa || !pb) return;
    const ha = /** @type {Handle} */ (c.a), hb = /** @type {Handle} */ (c.b);
    const before = out.length;
    frameCall(c, at, pa, pb, ha, hb);
    if (out.length > before) for (const k of [`${node(pa, ha.name)}|${node(pb, hb.name)}`, `${node(pb, hb.name)}|${node(pa, ha.name)}`]) refusedPairs.add(k);
  });
  /** One .frame call's checks and its edge. @param {any} c @param {{ file: string, line: number }} at @param {Part} pa @param {Part} pb @param {Handle} ha @param {Handle} hb */
  function frameCall(c, at, pa, pb, ha, hb) {
    const fa = pa.seams.frames[ha.name], fb = pb.seams.frames[hb.name];
    const sides = { from: side(ha), to: side(hb) };
    const text = `${handleText(ha)}, ${handleText(hb)}`;
    if (pa === pb) { add(at, "S257", `.frame(${text}) relates two frames of one part; the ${pa.dialectName} Dialect's own edges(record) relate its frames`, `relate a frame of ${pa.name} to a frame of another part`, sides); return; }
    /** @type {Edge} */
    let edge;
    if (c.edge === "fit") {
      const ea = pa.extents[ha.name], eb = pb.extents[hb.name];
      if (fa.dims !== fb.dims) { add(at, "S256", `.frame(${text}, "fit"): ${frameName(node(pa, ha.name))} has ${fa.dims} dims and ${frameName(node(pb, hb.name))} ${fb.dims}; fit maps one extent onto another of the same dims`, "relate frames of the same dims", sides); return; }
      if (!ea || !eb) { const missing = [!ea ? frameName(node(pa, ha.name)) : null, !eb ? frameName(node(pb, hb.name)) : null].filter(Boolean); add(at, "S256", `.frame(${text}, "fit"): ${missing.join(" and ")} declare${missing.length === 1 ? "s" : ""} no extent, so fit has no size to map`, `give the edge: .frame(${text}, { scale: …, offset: … })`, sides); return; }
      edge = fitEdge(ea, eb);
    } else {
      if (fa.dims !== fb.dims) { add(at, "S257", `.frame(${text}): ${frameName(node(pa, ha.name))} has ${fa.dims} dims and ${frameName(node(pb, hb.name))} ${fb.dims}; an edge joins frames of one dims`, "relate frames of the same dims", sides); return; }
      const n = normalizeEdge(c.edge, fa.dims);
      if (!n.ok) { add(at, "S257", `.frame(${text}, ${describe(c.edge)}): ${n.error}`, `.frame(${text}, { scale: 32, offset: 16 }), or "fit"`, sides); return; }
      edge = n.edge;
    }
    const clash = graph.add({ from: node(pa, ha.name), to: node(pb, hb.name), edge, by: "glue", glue: true, line: at.line });
    if (clash) add(at, "S253", `.frame(${text}) gives ${edgeText(edge)}, and a path already joins the two frames with ${edgeText(clash.existing.edge)}: ${pathText(clash.existing)}`, "remove one of the two, or make them agree", sides);
  }

  /** @type {Wire[]} */
  const wires = [];
  /** @type {Map<Handle, { file: string, line: number }>} */
  const wired = new Map();
  calls.forEach((c, i) => {
    if (c.kind !== "wire") return;
    const at = sites[i];
    const both = callSides(c.from, c.to);
    const pa = resolve(c.from, "out", at, ".wire", both), pb = resolve(c.to, "in", at, ".wire", both);
    if (!pa || !pb) return;
    const ho = /** @type {Handle} */ (c.from), hi = /** @type {Handle} */ (c.to);
    const text = `${handleText(ho)} cannot feed ${handleText(hi)}`;
    const sides = { from: side(ho), to: side(hi) };
    if (pa === pb) { add(at, "S114", `${handleText(ho)} is wired to ${handleText(hi)}, an input of its own part; a cycle inside a part is the ${pa.dialectName} Dialect's business`, "wire an output of one part to an input of another", sides); return; }
    if (wired.has(hi)) { add(at, "S112", `${handleText(hi)} is already wired (line ${wired.get(hi)?.line}); an input takes one wire`, "remove one of the two wires", sides); return; }
    wired.set(hi, at);
    const po = pa.seams.out[ho.name], pi = pb.seams.in[hi.name];
    const cmp = compareSeams(po.seam, pi.seam);
    /** @type {Wire} */
    const wire = { from: ho, to: hi, line: at.line, file: at.file, convert: [], dropped: cmp.dropped, ok: cmp.problems.length === 0 };
    for (const p of cmp.problems) add(at, p.code, `${text}: ${p.message}`, fixFor(p.code, po.seamText, pi.seamText), sides);
    for (const leaf of cmp.tagged) {
      const fromId = node(pa, leaf.from), toId = node(pb, leaf.to);
      const path = graph.path(fromId, toId);
      const field = leaf.field ? `the field '${leaf.field}'` : "the value";
      if (!path && refusedPairs.has(`${fromId}|${toId}`)) { wire.ok = false; continue; }
      if (!path) {
        const fa = `${pa.name}.frame.${leaf.from}`, fb = `${pb.name}.frame.${leaf.to}`;
        const fit = pa.extents[leaf.from] && pb.extents[leaf.to];
        add(at, "S251", `${text}: ${field} is ${article(leaf.kind)} in ${frameName(fromId)}; ${hi.name} takes ${article(leaf.kind)} in ${frameName(toId)}, and no frame path joins them`, fit ? `write .frame(${fa}, ${fb}, "fit"), or give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })` : `give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })${!pa.extents[leaf.from] || !pb.extents[leaf.to] ? " (\"fit\" needs both frames to declare an extent)" : ""}`, sides);
        wire.ok = false;
        continue;
      }
      if (leaf.kind === "quantity" && !uniform(path.edge)) {
        add(at, "S254", `${text}: ${field} is a quantity (a length) in ${frameName(fromId)}, and the path to ${frameName(toId)} scales its axes differently (${edgeText(path.edge)}): ${pathText(path)}`, "relate the frames with one scale for every axis (or a flip), or offer the value as a vector", sides);
        wire.ok = false;
        continue;
      }
      wire.convert.push({ field: leaf.field, kind: leaf.kind, from: frameName(fromId), to: frameName(toId), scale: path.edge.scale, offset: leaf.kind === "point" ? path.edge.offset : path.edge.offset.map(() => 0), text: convertText({ field: leaf.field, kind: leaf.kind, from: frameName(fromId), to: frameName(toId), edge: path.edge }), glue: path.steps.some((s) => s.glue) });
    }
    wires.push(wire);
  });

  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const i of Object.values(p.seams.in)) {
      if (!i.required) continue;
      const h = [...wired.keys()].find((w) => w.program === p.program && w.name === i.name);
      if (!h) add({ file: p.file, line: p.line }, "S113", `the required input ${p.name}.in.${i.name} (${i.seamText}) has no wire`, `wire one: .wire(<part>.out.<port>, ${p.name}.in.${i.name})`, { to: { part: p.name, dialect: p.dialectName, version: p.version, port: `in.${i.name}`, seam: i.seamText } });
    }
  }

  /** @type {Part | null} */
  let show = null;
  calls.forEach((c, i) => {
    if (c.kind !== "show") return;
    const program = programOf(c.value);
    const p = program ? parts.get(program) : undefined;
    if (!p) { add(sites[i], "S102", `.show(${describe(c.value)}): show takes a part of the composition`, "pass a builder you passed to .part"); return; }
    if (show) { add(sites[i], "S102", `.show(${p.name}) after .show(${show.name}); the page shows one part's stage`, "call .show once"); return; }
    show = p;
  });

  for (const r of registry.valueReads) add(r, "S301", `${r.handle} is read as a value at build time; a handle is not a value: it only names a port or a frame, for .wire and .frame`, "pass the handle to .wire or .frame; values flow only when the parts run");

  return { name, parts: [...parts.values()], wires, show, diagnostics: out };
}

/** Where a part's own diagnostic points: its file and line when that is in the hand-in, else the .part call. @param {any} d @param {{ file: string, line: number }} at */
function placed(d, at) {
  const file = typeof d.file === "string" && registry.dirUrl && d.file.startsWith(registry.dirUrl) ? decodeURIComponent(d.file.slice(registry.dirUrl.length)).replace(/\?.*$/, "") : null;
  return file && d.loc?.start?.line ? { file, line: d.loc.start.line } : at;
}

/** @param {string} kind */
const article = (kind) => (kind === "quantity" ? "a quantity" : `a ${kind}`);

/** @param {string} code @param {string} a @param {string} b */
function fixFor(code, a, b) {
  switch (code) {
    case "S201": case "S202": return `wire an output whose seam is ${b}, or an input that takes ${a}; a wire does not transform values`;
    case "S203": return `wire an output whose strings the input accepts (${b})`;
    case "S204": return "wire an output whose list fits the input's max";
    case "S252": return "both sides tagged with a frame, or both untagged; the kit cannot guess a frame";
    case "S255": return "a point feeds a point and a vector a vector";
    default: return "";
  }
}

/** @param {unknown} v */
function describe(v) {
  if (isHandle(v)) return handleText(v);
  if (v === null || v === undefined) return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "function") return "a function";
  if (typeof v !== "object") return String(v);
  const p = programOf(v);
  if (p) return partName(p);
  try { return JSON.stringify(v); } catch { return "an object"; }
}

