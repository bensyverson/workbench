// The checks behind compose(): the parts (each built and lowered by its own Grammar), the frame graph (each
// Dialect's own edges, then the glue's .frame calls), the wires (seams field by field after any rename, a frame
// path and a conversion by kind for each tagged leaf), the required inputs, the cycles, the shown part and the
// handles read as values. Every S diagnostic about a wire or an edge carries both sides.

import { programOf } from "../define/grammar.js";
import { lowerRecord } from "../define/lower.js";
import { instanceName } from "../define/record.js";
import { didYouMean } from "../define/codes.js";
import { isHandle, handleText, valueReadsOf } from "../define/handles.js";
import { compareSeams, FrameGraph, normalizeEdge, fitEdge, edgeText, convertText, uniform, show as showValue, SECONDS } from "../seam/index.js";
import { applyRename, undelayedLoops } from "./wires.js";

/** @import { Loc } from "../parse/ast.js" */
/** @import { Handle } from "../define/handles.js" */
/** @import { Seams } from "../define/define.js" */
/** @import { Edge, Path, Box } from "../seam/frames.js" */
/** @import { Side, ComposeDiagnostic, Conversion, Composed, ComposeOptions, GlueCall } from "./compose.js" */

/** @typedef {{ file: string, loc: Loc }} At */
/** @typedef {{ name: string, program: any, dialect: any, seams: Seams, dialectName: string, version?: string, record: Record<string, any> | null, extents: Record<string, Box>, edges: Array<{ from: string, to: string, edge: Edge }>, at: At }} Part */
/** @typedef {{ from: Handle, to: Handle, at: At, convert: Array<Conversion & { text: string }>, rename: Record<string, string>, delay: boolean, dropped: string[], ok: boolean }} Wire */

const WIRE_OPTIONS = ["rename", "delay"];

/**
 * @param {string} name @param {At} start @param {Array<GlueCall & { at: At }>} calls @param {ComposeOptions} options
 * @returns {{ diagnostics: ComposeDiagnostic[], record: Composed, plan: string[] }}
 */
export function analyze(name, start, calls, options) {
  /** @type {ComposeDiagnostic[]} */
  const out = [];
  /** @param {At} at @param {string} code @param {string} message @param {string} fix @param {{ from?: Side, to?: Side }} [sides] */
  const add = (at, code, message, fix, sides = {}) => out.push({ code, severity: "error", message, file: at.file, loc: at.loc, ...sides, fix });
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) add(start, "S102", `compose(${showValue(name)}): a composition's name is the workbench's, lowercase letters, digits and -`, 'compose("coin-bursts")');
  const versionOf = (/** @type {any} */ dialect) => options.packages?.find((p) => p.dialect === dialect || p.name === dialect.name)?.version;

  /** @type {Map<object, Part>} */
  const parts = new Map();
  /** @type {Map<string, Part>} */
  const byName = new Map();
  /** @type {Set<Part>} */
  const broken = new Set();
  for (const c of calls) {
    if (c.kind !== "part") continue;
    const program = programOf(c.value);
    if (!program) { add(c.at, "S102", `.part(${describe(c.value)}): a part is a Program built with a package's Grammar, such as maze("level").grid(…)…`, "pass the builder chain a package's Grammar returned"); continue; }
    const pn = instanceName(/** @type {any} */ (program.root));
    if (parts.has(program)) { add(c.at, "S102", `.part(${pn}) is called twice with one Program`, "add each part once"); continue; }
    const dialect = program.g.dialect;
    /** @type {Part} */
    const part = { name: pn, program, dialect, seams: dialect.seams, dialectName: String(dialect.name), version: versionOf(dialect), record: null, extents: {}, edges: [], at: c.at };
    parts.set(program, part);
    const first = byName.get(part.name);
    if (first) { add(c.at, "S101", `two parts are named '${part.name}' (${first.dialectName} at line ${first.at.loc.start.line}, and this ${part.dialectName}); a part's name is its address, unique in the composition`, `rename one: ${part.dialectName}("${part.name}2")`, { from: partSide(first), to: partSide(part) }); broken.add(part); continue; }
    byName.set(part.name, part);
    // the part, built and lowered by its own Grammar exactly as if it stood alone
    const { diagnostics: built } = program.analyze(options.build);
    const refused = built.filter((/** @type {any} */ d) => d.severity === "error");
    for (const d of refused) add(placed(d, c.at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, d.tip ?? "");
    if (refused.length) { broken.add(part); continue; }
    part.record = program.build(options.build);
    const lowered = lowerRecord(program.g, /** @type {Record<string, any>} */ (part.record));
    const errors = lowered.diagnostics.filter((/** @type {any} */ d) => d.severity === "error" || d.severity === undefined);
    for (const d of errors) add(placed(d, c.at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, /** @type {any} */ (d).tip ?? "");
    if (errors.length) { broken.add(part); continue; }
    part.extents = lowered.seams?.extents ?? {};
    part.edges = lowered.seams?.edges ?? [];
  }

  /** A part's side, with no port. @param {Part} p @returns {Side} */
  function partSide(p) { return { part: p.name, dialect: p.dialectName, ...(p.version ? { version: p.version } : {}) }; }
  /** A known handle's side. @param {Handle} h @returns {Side} */
  const side = (h) => {
    const p = /** @type {Part} */ (parts.get(h.program));
    if (h.side === "frame") return { ...partSide(p), frame: h.name, ...(h.dims !== undefined ? { dims: h.dims } : {}) };
    return { ...partSide(p), port: `${h.side}.${h.name}`, ...(h.seam ? { seam: h.seam } : {}) };
  };
  /** Whatever side a value is, as far as it is known: null for anything but a handle of a part. @param {unknown} h @returns {Side | null} */
  const anySide = (h) => {
    if (!isHandle(h)) return null;
    const p = parts.get(h.program);
    if (!p) return null;
    if (h.known) return side(h);
    return { ...partSide(p), ...(h.side === "frame" ? { frame: h.name } : { port: `${h.side}.${h.name}` }), has: names(p, h.side) };
  };
  /** @param {unknown} a @param {unknown} b */
  const callSides = (a, b) => { const from = anySide(a), to = anySide(b); return { ...(from ? { from } : {}), ...(to ? { to } : {}) }; };
  /** @param {Part} p @param {"out" | "in" | "frame"} s */
  const names = (p, s) => Object.keys(s === "out" ? p.seams.out : s === "in" ? p.seams.in : p.seams.frames);
  /**
   * The handle's part, or null after a diagnostic carrying whatever sides the call has.
   * @param {unknown} h @param {"out" | "in" | "frame"} want @param {At} at @param {string} call @param {{ from?: Side, to?: Side }} sides
   */
  const resolve = (h, want, at, call, sides) => {
    const what = want === "out" ? "output" : want === "in" ? "input" : "frame";
    if (!isHandle(h)) { add(at, "S102", `${call}: ${describe(h)} is not ${want === "frame" ? "a frame handle (part.frame.name)" : `an ${what} handle (part.${want}.name)`}`, want === "frame" ? '.frame(level.frame.cell, fx.frame.px, "fit")' : ".wire(level.out.picked, fx.in.burst)", sides); return null; }
    const p = parts.get(h.program);
    if (!p) { add(at, "S102", `${call}: ${handleText(h)} is a handle of a part not in the composition`, `add it first: .part(${h.part})`, sides); return null; }
    if (h.side !== want) { add(at, "S102", `${call}: ${handleText(h)} is ${h.side === "frame" ? "a frame" : h.side === "out" ? "an output" : "an input"}, and this place takes ${want === "frame" ? "a frame" : `an ${what}`}`, want === "frame" ? ".frame(a.frame.x, b.frame.y, edge)" : ".wire(producer.out.x, consumer.in.y)", sides); return null; }
    if (!h.known) {
      const has = names(p, want);
      add(at, "S111", `${call}: part '${p.name}' (${p.dialectName}${p.version ? ` ${p.version}` : ""}) has no ${what} '${h.name}'.${didYouMean(h.name, has)} Its ${what}s: ${has.length ? has.join(", ") : "none"}`, has.length ? `use one of: ${has.map((n) => `${p.name}.${want}.${n}`).join(", ")}` : `the ${p.dialectName} package declares no ${what}s`, sides);
      return null;
    }
    return broken.has(p) ? null : p;
  };

  // the frame graph: every part's frames, the kit's s once, each Dialect's own edges, then the glue's in order
  const graph = new FrameGraph();
  graph.addNode(SECONDS, 1);
  const node = (/** @type {Part} */ p, /** @type {string} */ f) => (f === SECONDS ? SECONDS : `${p.name}.${f}`);
  /** A frame as messages write it: maze.cell, or the kit's s. @param {string} id */
  const frameName = (id) => { if (id === SECONDS) return SECONDS; const [pn, f] = id.split("."); return `${byName.get(pn)?.dialectName ?? pn}.${f}`; };
  /** @param {Path} path */
  const pathText = (path) => path.steps.map((s) => `${frameName(s.backward ? s.to : s.from)} → ${frameName(s.backward ? s.from : s.to)} ${s.glue ? `(.frame at line ${s.line})` : `(${s.by}'s edges)`}${s.backward ? " run backward" : ""} ${edgeText(s.edge)}`).join("; ");
  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const f of Object.values(p.seams.frames)) graph.addNode(node(p, f.name), f.dims);
    for (const e of p.edges) {
      const clash = graph.add({ from: node(p, e.from), to: node(p, e.to), edge: e.edge, by: p.dialectName });
      if (clash) add(p.at, "S253", `part '${p.name}': the ${p.dialectName} Dialect's edges relate ${frameName(node(p, e.from))} to ${frameName(node(p, e.to))} twice, and the two disagree: ${pathText(clash.existing)}, against ${edgeText(e.edge)}`, `fix the ${p.dialectName} package's edges(record)`, { from: partSide(p), to: partSide(p) });
    }
  }
  /** Frame pairs a refused .frame meant to join: a wire across one is not also S251, which would only repeat it. @type {Set<string>} */
  const refusedPairs = new Set();
  for (const c of calls) {
    if (c.kind !== "frame") continue;
    const both = callSides(c.a, c.b);
    const pa = resolve(c.a, "frame", c.at, ".frame", both), pb = resolve(c.b, "frame", c.at, ".frame", both);
    if (!pa || !pb) continue;
    const ha = /** @type {Handle} */ (c.a), hb = /** @type {Handle} */ (c.b);
    const before = out.length;
    frameCall(c, pa, pb, ha, hb);
    if (out.length > before) for (const k of [`${node(pa, ha.name)}|${node(pb, hb.name)}`, `${node(pb, hb.name)}|${node(pa, ha.name)}`]) refusedPairs.add(k);
  }
  /** One .frame call's checks and its edge. @param {GlueCall & { kind: "frame", at: At }} c @param {Part} pa @param {Part} pb @param {Handle} ha @param {Handle} hb */
  function frameCall(c, pa, pb, ha, hb) {
    const at = c.at;
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
    const clash = graph.add({ from: node(pa, ha.name), to: node(pb, hb.name), edge, by: "glue", glue: true, line: at.loc.start.line });
    if (clash) add(at, "S253", `.frame(${text}) gives ${edgeText(edge)}, and a path already joins the two frames with ${edgeText(clash.existing.edge)}: ${pathText(clash.existing)}`, "remove one of the two, or make them agree", sides);
  }

  /** @type {Wire[]} */
  const wires = [];
  /** @type {Map<Handle, At>} */
  const wired = new Map();
  for (const c of calls) {
    if (c.kind !== "wire") continue;
    const at = c.at;
    const both = callSides(c.from, c.to);
    const opts = wireOptions(c.options);
    if (typeof opts === "string") { add(at, "S102", `.wire(…, …, ${describe(c.options)}): ${opts}`, ".wire(a.out.x, b.in.y, { rename: { pos: \"at\" }, delay: true }), each optional", both); continue; }
    const pa = resolve(c.from, "out", at, ".wire", both), pb = resolve(c.to, "in", at, ".wire", both);
    if (!pa || !pb) continue;
    const ho = /** @type {Handle} */ (c.from), hi = /** @type {Handle} */ (c.to);
    const text = `${handleText(ho)} cannot feed ${handleText(hi)}`;
    const sides = { from: side(ho), to: side(hi) };
    if (pa === pb) { add(at, "S114", `${handleText(ho)} is wired to ${handleText(hi)}, an input of its own part; a cycle inside a part is the ${pa.dialectName} Dialect's business`, "wire an output of one part to an input of another", sides); continue; }
    if (wired.has(hi)) { add(at, "S112", `${handleText(hi)} is already wired (line ${wired.get(hi)?.loc.start.line}); an input takes one wire`, "remove one of the two wires", sides); continue; }
    wired.set(hi, at);
    const po = pa.seams.out[ho.name], pi = pb.seams.in[hi.name];
    /** @type {Wire} */
    const wire = { from: ho, to: hi, at, convert: [], rename: opts.rename, delay: opts.delay, dropped: [], ok: true };
    wires.push(wire);
    const renamed = applyRename(po.seam, pi.seam, opts.rename);
    if (renamed.problems.length) {
      for (const p of renamed.problems) add(at, "S205", `${text}: ${p.message}`, p.fix, sides);
      wire.ok = false;
      continue;
    }
    const cmp = compareSeams(renamed.seam, pi.seam);
    wire.dropped = cmp.dropped;
    if (cmp.problems.length) wire.ok = false;
    for (const p of cmp.problems) add(at, p.code, `${text}: ${p.message}`, fixFor(p.code, po.seamText, pi.seamText), sides);
    for (const leaf of cmp.tagged) {
      const fromId = node(pa, leaf.from), toId = node(pb, leaf.to);
      const path = graph.path(fromId, toId);
      const field = leaf.field ? `the field '${leaf.field}'` : "the value";
      const kind = leaf.kind === "quantity" ? "a quantity" : `a ${leaf.kind}`;
      if (!path && refusedPairs.has(`${fromId}|${toId}`)) { wire.ok = false; continue; }
      if (!path) {
        wire.ok = false;
        const fa = `${pa.name}.frame.${leaf.from}`, fb = `${pb.name}.frame.${leaf.to}`;
        const da = graph.nodes.get(fromId), db = graph.nodes.get(toId);
        if (da !== db) { add(at, "S251", `${text}: ${field} is ${kind} in ${frameName(fromId)} (${da} dims); ${hi.name} takes ${kind} in ${frameName(toId)} (${db} dims), and no edge joins frames of different dims`, `wire an output measured in a frame of ${db} dims, or an input that takes one of ${da}; a .frame cannot join these two`, sides); continue; }
        const fit = pa.extents[leaf.from] && pb.extents[leaf.to];
        add(at, "S251", `${text}: ${field} is ${kind} in ${frameName(fromId)}; ${hi.name} takes ${kind} in ${frameName(toId)}, and no frame path joins them`, fit ? `write .frame(${fa}, ${fb}, "fit"), or give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … })` : `give the edge: .frame(${fa}, ${fb}, { scale: …, offset: … }) ("fit" needs both frames to declare an extent)`, sides);
        continue;
      }
      if (leaf.kind === "quantity" && !uniform(path.edge)) {
        wire.ok = false;
        add(at, "S254", `${text}: ${field} is a quantity (a length) in ${frameName(fromId)}, and the path to ${frameName(toId)} scales its axes differently (${edgeText(path.edge)}): ${pathText(path)}`, "relate the frames with one scale for every axis (or a flip), or offer the value as a vector", sides);
        continue;
      }
      const conv = { field: leaf.field, kind: leaf.kind, ...(leaf.rate ? { rate: /** @type {const} */ (true) } : {}), from: frameName(fromId), to: frameName(toId), ...planOf(leaf.kind, path.edge) };
      wire.convert.push({ ...conv, text: convertText({ ...conv, edge: path.edge }) });
    }
  }

  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const i of Object.values(p.seams.in)) {
      if (!i.required || [...wired.keys()].some((w) => w.program === p.program && w.name === i.name)) continue;
      add(p.at, "S113", `the required input ${p.name}.in.${i.name} (${i.seamText}) has no wire`, `wire one: .wire(<part>.out.<port>, ${p.name}.in.${i.name})`, { to: { ...partSide(p), port: `in.${i.name}`, seam: i.seamText } });
    }
  }

  // a cycle of wires needs one delayed wire in it; which wire the glue wrote last never decides it
  const order = [...parts.values()].map((p) => p.name);
  for (const { loop, wires: ws } of undelayedLoops(order, wires.map((w) => ({ from: w.from.part, to: w.to.part, delay: w.delay, wire: w })))) {
    const first = ws[0];
    add(first.at, "S115", `the wires make a loop with no delay: ${loop.join(" → ")} (${ws.map((w) => `${handleText(w.from)} → ${handleText(w.to)}`).join(", ")}); each part would wait on the other within one instant`, `mark one wire of the loop delayed: .wire(${handleText(first.from)}, ${handleText(first.to)}, { delay: true }), so its consumer reads the previous instant's snapshot`, { from: side(first.from), to: side(first.to) });
  }

  /** @type {Part | null} */
  let shown = null;
  for (const c of calls) {
    if (c.kind !== "show") continue;
    const program = programOf(c.value);
    const p = program ? parts.get(program) : undefined;
    if (!p) { add(c.at, "S102", `.show(${describe(c.value)}): show takes a part of the composition`, "pass a builder you passed to .part"); continue; }
    if (shown) { add(c.at, "S102", `.show(${p.name}) after .show(${shown.name}); the page shows one part's stage`, "call .show once"); continue; }
    shown = p;
  }

  for (const p of parts.values()) {
    for (const r of valueReadsOf(p.program)) {
      const [, sideName, portName] = r.handle.split(".");
      add(r, "S301", `${r.handle} is read as a value at build time; a handle is not a value: it only names a port or a frame, for .wire and .frame`, "pass the handle to .wire or .frame; values flow only when the parts run", { from: { ...partSide(p), ...(sideName === "frame" ? { frame: portName } : { port: `${sideName}.${portName}` }) } });
    }
  }

  const live = /** @type {Part | null} */ (shown);
  /** @type {Composed} */
  const record = {
    name,
    parts: [...parts.values()].filter((p) => !broken.has(p)).map((p) => ({ name: p.name, dialect: p.dialectName, ...(p.version ? { version: p.version } : {}), record: /** @type {Record<string, any>} */ (p.record) })),
    wires: wires.filter((w) => w.ok).map((w) => {
      const consumer = /** @type {Part} */ (parts.get(w.to.program)).seams.in[w.to.name];
      return { from: handleText(w.from), to: handleText(w.to), convert: w.convert.map(({ text: _, ...c }) => c), rename: w.rename, delay: w.delay, dropped: w.dropped, ...(consumer.delivery ? { delivery: consumer.delivery } : {}) };
    }),
    show: live ? live.name : null,
  };
  const plan = wires.filter((w) => w.ok).map((w) => `${handleText(w.from)} → ${handleText(w.to)}: ${w.convert.map((c) => c.text).join("; ") || "unchanged"}${w.dropped.length ? `; drops ${w.dropped.join(", ")}` : ""}${w.delay ? "; delayed" : ""}`);
  return { diagnostics: out, record, plan };
}

/** A wire's options, or why they are not `{ rename?, delay? }`. @param {unknown} o @returns {{ rename: Record<string, string>, delay: boolean } | string} */
function wireOptions(o) {
  if (o === undefined) return { rename: {}, delay: false };
  if (o === null || typeof o !== "object" || Array.isArray(o)) return "a wire's options are { rename?, delay? }";
  const x = /** @type {Record<string, unknown>} */ (o);
  const extra = Object.keys(x).filter((k) => !WIRE_OPTIONS.includes(k));
  if (extra.length) return `a wire takes only rename and delay, not ${extra.map((k) => `'${k}'`).join(", ")}.${didYouMean(extra[0], WIRE_OPTIONS)}`;
  if (x.delay !== undefined && typeof x.delay !== "boolean") return `delay is true or false, not ${describe(x.delay)}`;
  const r = x.rename;
  if (r !== undefined && (r === null || typeof r !== "object" || Array.isArray(r) || !Object.values(r).every((v) => typeof v === "string"))) return `rename is { producerField: "consumerField" }, not ${describe(r)}`;
  return { rename: /** @type {Record<string, string>} */ ({ ...(r ?? {}) }), delay: x.delay === true };
}

/** Where a part's own diagnostic points: its file and line when it has one, else the .part call. @param {any} d @param {At} at @returns {At} */
const placed = (d, at) => (typeof d.file === "string" && d.file && d.loc?.start?.line ? { file: d.file, loc: d.loc } : at);

/** @param {string} code @param {string} a @param {string} b */
function fixFor(code, a, b) {
  switch (code) {
    case "S201": case "S202": return `wire an output whose seam is ${b}, or an input that takes ${a}; a wire may rename record fields ({ rename: { from: "to" } }) but does not transform values`;
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
  if (p) return instanceName(/** @type {any} */ (p).root);
  return showValue(v);
}

/**
 * A conversion's numbers as the record keeps them: a point's scale and offset per axis, a vector's scale per axis
 * (sign kept, no offset), a quantity's one magnitude (a length is a size: a flip does not make it negative). A rate
 * converts as its kind: the kit's s is the same in every part.
 * @param {"point" | "vector" | "quantity"} kind @param {Edge} edge
 * @returns {{ scale: number[], offset: number[] }}
 */
function planOf(kind, edge) {
  if (kind === "quantity") return { scale: [Math.abs(edge.scale[0])], offset: [0] };
  return { scale: edge.scale, offset: kind === "point" ? edge.offset : edge.offset.map(() => 0) };
}
