// The checks behind compose(): the parts (each built and lowered by its own Grammar), the frame graph (each
// Dialect's own edges, then the glue's .frame calls), the wires (seams field by field after any rename, a frame
// path and a conversion by kind for each tagged leaf, and any wire constant), the param wires (param-wires.js), the
// required inputs, the cycles, each reliable Event wire's queue bound (given the runtimes), the shown part and the
// handles read as values. Every S diagnostic about a wire or an edge carries both sides.

import { programOf } from "../define/grammar.js";
import { BUILT_WITH } from "../define/sites.js";
import { lowerRecord } from "../define/lower.js";
import { instanceName } from "../define/record.js";
import { didYouMean } from "../define/codes.js";
import { isHandle, handleText, valueReadsOf } from "../define/handles.js";
import { withDrawMaxes, shownDraw } from "./draw.js";
import { compareSeams, printValue, printSeam, FrameGraph, edgeText, convertText, uniform, show as showValue, SECONDS } from "../seam/index.js";
import { applyRename, applySet, undelayedLoops } from "./wires.js";
import { paramWireProblems, paramLoops, rateOf } from "./param-wires.js";
import { queueProblems } from "./queues.js";
import { withPage, pageRuntimeFor, isPageHandle, pageControls, pageSeams, uiFor, page, pageControlFor, scopedOf } from "./page.js";
import { layerOf, registerLayers, planLayers, layerHandleProblem, LAYER } from "./layer.js";
import { glueEdge, derived, edgeFor, derivationText, edgeForms, noPathFix } from "./edges.js";
import { planOf, notesOf } from "./replan.js";

/** @import { Loc } from "../parse/ast.js" */
/** @import { Handle } from "../define/handles.js" */
/** @import { Seams } from "../define/define.js" */
/** @import { Edge, Path, Box } from "../seam/frames.js" */
/** @import { Side, ComposeDiagnostic, Conversion, Composed, ComposeOptions, GlueCall } from "./compose.js" */

/** @typedef {{ file: string, loc: Loc }} At */
/** A layer's Part (layer.js) has `layer` once judged, else null; a user part has none. @typedef {{ name: string, program: any, dialect: any, seams: Seams, dialectName: string, version?: string, record: Record<string, any> | null, extents: Record<string, Box>, edges: Array<{ from: string, to: string, edge: Edge }>, at: At, layer?: import("./layer.js").Judged | null }} Part */
/** `into` is "param" for a wire into a param (param-wires.js), which kit/run applies between instants; `fixed` for a layer's input, which takes no options. @typedef {{ from: Handle, to: Handle, into: "in" | "param", at: At, convert: Array<Conversion & { text: string }>, rename: Record<string, string>, set: Record<string, unknown>, delay: boolean, overflow: Overflow | null, dropped: string[], fill: Record<string, unknown>, ok: boolean, fixed?: true }} Wire */
/** What a wire drops when its records outrun the consumer's max (ruling 7, 2026-11-26). @typedef {"keepLast" | "keepFirst"} Overflow */

const WIRE_OPTIONS = ["rename", "set", "delay", "overflow"];
const OVERFLOWS = ["keepLast", "keepFirst"];

/**
 * @param {string} name @param {At} start @param {Array<GlueCall & { at: At }>} given  the glue's calls (the page is added) @param {ComposeOptions} options
 * @returns {{ diagnostics: ComposeDiagnostic[], record: Composed, plan: string[] }}
 */
export function analyze(name, start, given, options) {
  const calls = withPage(given, start);
  /** @type {ComposeDiagnostic[]} */
  const out = [];
  /** @param {At} at @param {string} code @param {string} message @param {string} fix @param {{ from?: Side, to?: Side }} [sides] */
  const add = (at, code, message, fix, sides = {}, severity = /** @type {"error" | "warning"} */ ("error")) => out.push({ code, severity, message, file: at.file, loc: at.loc, ...sides, fix });
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) add(start, "S102", `compose(${showValue(name)}): a composition's name is the workbench's, lowercase letters, digits and -`, 'compose("coin-bursts")');
  const versionOf = (/** @type {any} */ dialect) => options.packages?.find((p) => p.dialect === dialect || p.name === dialect.name)?.version;

  /** @type {Map<object, Part>} */
  const parts = new Map();
  /** @type {Map<string, Part>} */
  const byName = new Map();
  /** @type {Set<Part>} */
  const broken = new Set();
  for (const c of calls) {
    if (c.kind !== "part" || layerOf(c.value)) continue; // a layer is judged once the parts are built (layer.js)
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
    // a part's warnings are the composition's too, as warnings: a preset's and a glue part's alike (review M1)
    for (const d of [...refused, ...built.filter((/** @type {any} */ d) => d.severity === "warning")]) add(placed(d, c.at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, d.tip ?? "", {}, d.severity === "warning" ? "warning" : "error");
    if (refused.length) { broken.add(part); continue; }
    part.record = program.build(options.build);
    const lowered = lowerRecord(program.g, /** @type {Record<string, any>} */ (part.record));
    const errors = lowered.diagnostics.filter((/** @type {any} */ d) => d.severity === "error" || d.severity === undefined);
    for (const d of [...errors, ...lowered.diagnostics.filter((/** @type {any} */ d) => d.severity === "warning")]) add(placed(d, c.at), d.code, `part '${part.name}' (${part.dialectName}): ${d.message}`, /** @type {any} */ (d).tip ?? "", {}, d.severity === "warning" ? "warning" : "error");
    if (errors.length) { broken.add(part); continue; }
    part.extents = lowered.seams?.extents ?? {};
    part.edges = lowered.seams?.edges ?? [];
    part.seams = withDrawMaxes(part.seams, lowered.seams?.draws);
  }

  // the page's outputs are the composed parts' declared Controls (declared Controls, 2026-11-27)
  const withUI = [...parts.values()].filter((p) => !broken.has(p)).map((p) => ({ name: p.name, dialectName: p.dialectName, ui: uiFor(options.packages, p.dialect), part: p })).filter((x) => x.ui && x.dialectName !== "page");
  const { controls, clashes, sharedKeys } = pageControls(withUI);
  const pagePart = [...parts.values()].find((p) => p.dialectName === "page" && p.name === "page");
  if (pagePart) pagePart.seams = { ...pagePart.seams, out: pageSeams(controls) };
  for (const c of clashes) {
    const at = withUI.find((x) => x.name === c.second.part)?.part.at ?? start;
    add(at, "S119", `the Control '${c.name}' is declared by part '${c.first.part}' (${c.first.dialect}) as ${JSON.stringify(c.first.decl)} and by part '${c.second.part}' (${c.second.dialect}) as ${JSON.stringify(c.second.decl)}: one name is one Control on the page, so two parts may share it only with equal declarations (a keyed one, or one with to, would be each part's own)`, `rename one part's Control (and its Event input), or make the two declarations equal`);
  }
  for (const k of sharedKeys) add(start, "S121", `the key ${k.code} is bound by two Controls, '${k.controls[0]}' and '${k.controls[1]}': one keyboard has one meaning per key, so '${k.controls[0]}', declared first, takes it`, `give '${k.controls[1]}' another code, or override the key map in the host`, {}, "warning");

  /** A part's side, with no port. @param {Part} p @returns {Side} */
  function partSide(p) { return { part: p.name, dialect: p.dialectName, ...(p.version ? { version: p.version } : {}) }; }
  /** A known handle's side. @param {Handle} h @returns {Side} */
  const side = (h) => {
    const p = /** @type {Part} */ (parts.get(h.program));
    if (h.side === "frame") return { ...partSide(p), frame: h.name, ...(h.dims !== undefined ? { dims: h.dims } : {}) };
    const seam = (h.side === "out" ? p.seams.out : p.seams.in)[h.name]?.seamText ?? h.seam; // a Draw output's at its Program's max
    return { ...partSide(p), port: `${h.side}.${h.name}`, ...(seam ? { seam } : {}) };
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
  /** @param {Part} p @param {"out" | "in" | "frame" | "param"} s */
  const names = (p, s) => (s === "param" ? [...p.program.declared().keys()] : Object.keys(s === "out" ? p.seams.out : s === "in" ? p.seams.in : p.seams.frames));
  /**
   * The handle's part, or null after a diagnostic carrying whatever sides the call has.
   * @param {unknown} h @param {"out" | "in" | "frame" | "param"} want @param {At} at @param {string} call @param {{ from?: Side, to?: Side }} sides
   */
  const resolve = (h, want, at, call, sides) => {
    const what = want === "out" ? "output" : want === "in" ? "input" : want;
    if (!isHandle(h)) { add(at, "S102", `${call}: ${describe(h)} is not ${want === "frame" ? "a frame handle (part.frame.name)" : `an ${what} handle (part.${want}.name)`}`, want === "frame" ? '.frame(level.frame.cell, fx.frame.px, "fit")' : ".wire(level.out.picked, fx.in.burst)", sides); return null; }
    const p = parts.get(h.program);
    if (!p) { add(at, "S102", `${call}: ${handleText(h)} is a handle of a part not in the composition`, `add it first: .part(${h.part})`, sides); return null; }
    if (h.side !== want) { add(at, "S102", `${call}: ${handleText(h)} is ${h.side === "frame" ? "a frame" : h.side === "param" ? "a param" : h.side === "out" ? "an output" : "an input"}, and this place takes ${want === "frame" ? "a frame" : want === "in" ? "an input or a param" : `an ${what}`}`, want === "frame" ? ".frame(a.frame.x, b.frame.y, edge)" : ".wire(producer.out.x, consumer.in.y)", sides); return null; }
    if (!h.known && p.layer !== undefined) { const lp = layerHandleProblem(p, h); add(at, "S111", `${call}: ${lp.message}`, lp.fix, sides); return null; }
    if (!h.known && p === pagePart && want === "out" && Object.hasOwn(controls, h.name)) return broken.has(p) ? null : p;
    const scoped = !h.known && p === pagePart ? scopedOf(controls, h.name) : [];
    if (scoped.length) {
      add(at, "S111", `${call}: the page has no Control '${h.name}' for this wire: ${scoped.map((n) => `'${n}'`).join(" and ")} ${scoped.length === 1 ? "is" : "are"} each one part's own (keyed, or with to), and page.out.${h.name} names one only in a wire into the part that declares it`, `wire the part's own by its page name: ${scoped.map((n) => `page.out[${JSON.stringify(n)}]`).join(" or ")}`, sides);
      return null;
    }
    if (!h.known && p === pagePart) {
      const has = names(p, want);
      const given = (options.packages ?? []).some((x) => x?.ui);
      add(at, "S111", `${call}: the page has no Control '${h.name}'.${didYouMean(h.name, has)} Its Controls: ${has.length ? has.join(", ") : "none"}`, given ? (has.length ? `use one of: ${has.map((n) => `page.out.${n}`).join(", ")}, or declare it in a part's UI: controls: { ${h.name}: { kind: … } }` : `declare it in a part's UI: controls: { ${h.name}: { kind: … } }`) : "the page's Controls come from the parts' UIs: pass the loaded packages (kit/package's loadPackage results) in the options' packages", sides);
      return null;
    }
    if (!h.known) {
      const has = names(p, want);
      add(at, "S111", `${call}: part '${p.name}' (${p.dialectName}${p.version ? ` ${p.version}` : ""}) has no ${what} '${h.name}'.${didYouMean(h.name, has)} Its ${what}s: ${has.length ? has.join(", ") : "none"}`, has.length ? `use one of: ${has.map((n) => `${p.name}.${want}.${n}`).join(", ")}` : want === "param" ? `the ${p.name} Program declares no params` : `the ${p.dialectName} package declares no ${what}s`, sides);
      return null;
    }
    return broken.has(p) ? null : p;
  };

  // a frame node: a part's frame, the kit's s, or for a layer its bottom producer's frame (it has none of its own)
  const node = (/** @type {Part} */ p, /** @type {string} */ f) => (f === SECONDS ? SECONDS : p.layer ? p.layer.frameNode : `${p.name}.${f}`);
  registerLayers(calls, { parts, byName, broken, add, resolve, side, partSide, anySide, node });

  // the frame graph: every part's frames, the kit's s once, each Dialect's own edges, then the glue's in order
  const graph = new FrameGraph();
  graph.addNode(SECONDS, 1);
  /** A frame as messages write it: maze.cell, or the kit's s. @param {string} id */
  const frameName = (id) => { if (id === SECONDS) return SECONDS; const [pn, f] = id.split("."); return `${byName.get(pn)?.dialectName ?? pn}.${f}`; };
  /** @param {Path} path */
  const pathText = (path) => path.steps.map((s) => `${frameName(s.backward ? s.to : s.from)} → ${frameName(s.backward ? s.from : s.to)} ${s.glue ? `(.frame at line ${s.line})` : `(${s.by}'s edges)`}${s.backward ? " run backward" : ""} ${edgeText(s.edge)}${s.note ? ` ${s.note}` : ""}`).join("; ");
  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const f of Object.values(p.seams.frames)) graph.addNode(node(p, f.name), f.dims);
    for (const e of p.edges) {
      const clash = graph.add({ from: node(p, e.from), to: node(p, e.to), edge: e.edge, by: p.dialectName });
      if (clash) add(p.at, "S253", `part '${p.name}': the ${p.dialectName} Dialect's edges relate ${frameName(node(p, e.from))} to ${frameName(node(p, e.to))} twice, and the two disagree: ${pathText(clash.existing)}, against ${edgeText(e.edge)}`, `fix the ${p.dialectName} package's edges(record)`, { from: partSide(p), to: partSide(p) });
    }
  }
  /** The glue's edges that planned, in order: the record's `frames`, which kit/run plans again after a rebuild. @type {import("./compose.js").GlueFrame[]} */
  const frames = [];
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
  /** One .frame call's checks and its edge, kept in the record's `frames` when it plans. @param {GlueCall & { kind: "frame", at: At }} c @param {Part} pa @param {Part} pb @param {Handle} ha @param {Handle} hb */
  function frameCall(c, pa, pb, ha, hb) {
    const at = c.at;
    const fa = pa.seams.frames[ha.name], fb = pb.seams.frames[hb.name];
    const sides = { from: side(ha), to: side(hb) };
    const text = `${handleText(ha)}, ${handleText(hb)}`;
    const fromId = node(pa, ha.name), toId = node(pb, hb.name);
    if (pa === pb) { add(at, "S257", `.frame(${text}) relates two frames of one part; the ${pa.dialectName} Dialect's own edges(record) relate its frames`, `relate a frame of ${pa.name} to a frame of another part`, sides); return; }
    if (fa.dims !== fb.dims) {
      if (c.edge === "fit") add(at, "S256", `.frame(${text}, "fit"): ${frameName(fromId)} has ${fa.dims} dims and ${frameName(toId)} ${fb.dims}; fit maps one extent onto another of the same dims`, "relate frames of the same dims", sides);
      else add(at, "S257", `.frame(${text}): ${frameName(fromId)} has ${fa.dims} dims and ${frameName(toId)} ${fb.dims}; an edge joins frames of one dims`, "relate frames of the same dims", sides);
      return;
    }
    const g = glueEdge(c.edge, fa.dims);
    if (!g.ok) { add(at, "S257", `.frame(${text}, ${describe(c.edge)}): ${g.error}`, edgeForms(text, fa.dims), sides); return; }
    const ea = pa.extents[ha.name], eb = pb.extents[hb.name];
    if (derived(g.given) && (!ea || !eb)) {
      const missing = [!ea ? frameName(fromId) : null, !eb ? frameName(toId) : null].filter(Boolean);
      const what = g.given === "fit" ? `.frame(${text}, "fit")` : `.frame(${text}, ${describe(c.edge)})`;
      const why = g.given === "fit" ? "so fit has no size to map" : "so an anchored edge has no box to align";
      add(at, "S256", `${what}: ${missing.join(" and ")} declare${missing.length === 1 ? "s" : ""} no extent, ${why}`, `give the edge: .frame(${text}, { scale: …, offset: … })`, sides);
      return;
    }
    const line = at.loc.start.line;
    const edge = edgeFor(g.given, ea, eb);
    const note = derivationText(g.given, line, ea, eb);
    const clash = graph.add({ from: fromId, to: toId, edge, by: "glue", glue: true, line, ...(note ? { note } : {}) });
    if (clash) { add(at, "S253", `.frame(${text}) gives ${edgeText(edge)}${note ? ` ${note}` : ""}, and a path already joins the two frames with ${edgeText(clash.existing.edge)}: ${pathText(clash.existing)}`, "remove one of the two, or make them agree", sides); return; }
    frames.push({ from: fromId, to: toId, line, given: g.given, edge });
  }

  /** A layer's inputs are wires too, fixed when the layer was made. @type {Wire[]} */
  const wires = planLayers({
    parts, byName, broken, add, resolve, side, partSide, anySide, node, graph, refusedPairs, frameName,
    extentOf: (id) => { const [pn, f] = id.split("."); return byName.get(pn)?.extents[f]; },
    conversion: (fromId, toId, path) => { const conv = { field: "", kind: /** @type {const} */ ("draw"), from: frameName(fromId), to: frameName(toId), fromId, toId, ...planOf("draw", path.edge) }; return { ...conv, text: convertText({ ...conv, edge: path.edge }) + notesOf(path) }; },
  });
  /**
   * A wire's producer as the page names it: a glue's page.out.<control> into a part that declares that Control scoped
   * (keyed, or with to) is that part's own, page.out["<part>.<control>"], so a glue that plays one instance plays two.
   * @param {unknown} h @param {unknown} to
   */
  const pageFrom = (h, to) => {
    if (!isPageHandle(h) || /** @type {Handle} */ (h).known) return h;
    const consumer = isHandle(to) ? parts.get(to.program)?.name ?? null : null;
    const n = pageControlFor(controls, /** @type {Handle} */ (h).name, consumer);
    return n !== null && n !== /** @type {Handle} */ (h).name ? page.out[n] : h;
  };
  /** Each wired input or param, by its handle's text. @type {Map<string, At>} */
  const wired = new Map();
  /** The inputs the glue wired, however the wire fared: a wire refused for its producer or its output is that wire's problem, not a missing one. @type {Set<string>} */
  const attempted = new Set();
  for (const c of calls) {
    if (c.kind !== "wire") continue;
    const at = c.at;
    if (isHandle(c.to) && c.to.side === "in" && c.to.known && parts.has(c.to.program)) attempted.add(`${c.to.part}.${c.to.name}`);
    const from = pageFrom(c.from, c.to);
    const both = callSides(from, c.to);
    const into = isHandle(c.to) && c.to.side === "param" ? "param" : "in";
    const opts = into === "param" && c.options !== undefined ? "a param wire takes no options: it sets the param to the output's value, between instants" : wireOptions(c.options);
    if (typeof opts === "string") { add(at, "S102", `.wire(…, …, ${describe(c.options)}): ${opts}`, into === "param" ? "remove the options" : ".wire(a.out.x, b.in.y, { rename: { pos: \"at\" }, set: { kind: \"coin\" }, delay: true, overflow: \"keepLast\" }), each optional", both); continue; }
    const pa = resolve(from, "out", at, ".wire", both), pb = resolve(c.to, into, at, ".wire", both);
    if (!pa || !pb) continue;
    const ho = /** @type {Handle} */ (from), hi = /** @type {Handle} */ (c.to);
    const text = `${handleText(ho)} cannot feed ${handleText(hi)}`;
    const sides = { from: side(ho), to: side(hi) };
    if (wired.has(handleText(hi))) { add(at, "S112", `${handleText(hi)} is already wired (line ${wired.get(handleText(hi))?.loc.start.line}); ${into === "param" ? "a param" : "an input"} takes one wire`, "remove one of the two wires", sides); continue; }
    if (into === "param") {
      wired.set(handleText(hi), at);
      const problems = pa === pb ? [] : paramWireProblems(pa.seams.out[ho.name], hi, handleText(ho));
      for (const p of problems) add(at, p.code, `${text}: ${p.message}`, p.fix, sides);
      wires.push({ from: ho, to: hi, into, at, convert: [], rename: {}, set: {}, delay: false, overflow: null, dropped: [], fill: {}, ok: problems.length === 0 });
      continue;
    }
    if (pa === pb) { add(at, "S114", `${handleText(ho)} is wired to ${handleText(hi)}, an input of its own part; a cycle inside a part is the ${pa.dialectName} Dialect's business`, "wire an output of one part to an input of another", sides); continue; }
    wired.set(handleText(hi), at);
    const po = pa.seams.out[ho.name], pi = pb.seams.in[hi.name];
    if (opts.overflow && pi.seam.kind !== "event") { add(at, "S102", `.wire(${handleText(ho)}, ${handleText(hi)}, { overflow: "${opts.overflow}" }): ${handleText(hi)} is a value input, which reads the latest value; overflow is for an Event wire`, "remove overflow", sides); continue; }
    /** @type {Wire} */
    const wire = { from: ho, to: hi, into, at, convert: [], rename: opts.rename, set: opts.set, delay: opts.delay, overflow: opts.overflow, dropped: [], fill: {}, ok: true };
    wires.push(wire);
    const renamed = applyRename(po.seam, pi.seam, opts.rename);
    if (renamed.problems.length) {
      for (const p of renamed.problems) add(at, "S205", `${text}: ${p.message}`, p.fix, sides);
      wire.ok = false;
      continue;
    }
    // a wire constant's fields are the glue's, so the producer is compared with the rest of the consumer's record
    const fixed = applySet(renamed.seam, pi.seam, opts.set);
    if (fixed.problems.length) {
      for (const p of fixed.problems) add(at, p.code, `${text}: ${p.message}`, p.fix, sides);
      wire.ok = false;
      continue;
    }
    const cmp = compareSeams(renamed.seam, fixed.seam);
    wire.dropped = cmp.dropped;
    wire.fill = cmp.filled;
    if (cmp.problems.length) wire.ok = false;
    for (const p of cmp.problems) add(at, p.code, `${text}: ${p.message}`, fixFor(p.code, po.seamText, pi.seamText), sides);
    /** A tagged leaf plans when a frame path joins its frames (and a quantity's path scales its axes alike): the test S251 and S254 apply below. @param {{ from: string, to: string, kind: string }} leaf */
    const plans = (leaf) => { const path = graph.path(node(pa, leaf.from), node(pb, leaf.to)); return !!path && (leaf.kind !== "quantity" || uniform(path.edge)); };
    // the wire builds, so say what it will do; a field of the same kind is no evidence of the same meaning (a running
    // total is not a per-event amount, r2GURg), so a constant and a rename are offered alike
    for (const m of maskedRenames(renamed.seam, fixed.seam, cmp, plans)) {
      const wire = `.wire(${handleText(ho)}, ${handleText(hi)}, `;
      add(at, "S206", `${handleText(ho)} → ${handleText(hi)}: the wire drops ${m.from}, which ${handleText(hi)} does not take, and gives ${m.to} its default (${m.to}: ${m.type} = ${printValue(/** @type {any} */ (cmp.filled[m.to]))}) in every record; ${m.from} is a field of the same kind, which may or may not mean the same`, `if ${m.to} should be a fixed value, set it: ${wire}{ set: { ${m.to}: <value> } }); only if ${m.from} means what ${m.to} does, rename it: ${wire}{ rename: { ${m.from}: "${m.to}" } }); if the default is intended, say so: ${wire}{ set: { ${m.to}: ${printValue(/** @type {any} */ (cmp.filled[m.to]))} } })`, sides, "warning");
    }
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
        if (leaf.from === SECONDS || leaf.to === SECONDS) {
          add(at, "S251", `${text}: ${field} is ${kind} in ${frameName(fromId)}; ${hi.name} takes ${kind} in ${frameName(toId)}, and no frame path joins them`, `the kit's s relates to no package frame (a .frame cannot name it, nor can a Dialect's edges); wire ports measured in s on both sides, or have ${leaf.from === SECONDS ? pb.name : pa.name} measure its time in s`, sides);
          continue;
        }
        const fit = !!(pa.extents[leaf.from] && pb.extents[leaf.to]);
        add(at, "S251", `${text}: ${field} is ${kind} in ${frameName(fromId)}; ${hi.name} takes ${kind} in ${frameName(toId)}, and no frame path joins them`, noPathFix(fa, fb, fit, leaf.kind === "draw"), sides);
        continue;
      }
      if (leaf.kind === "quantity" && !uniform(path.edge)) {
        wire.ok = false;
        add(at, "S254", `${text}: ${field} is a quantity (a length) in ${frameName(fromId)}, and the path to ${frameName(toId)} scales its axes differently (${edgeText(path.edge)}): ${pathText(path)}`, "relate the frames with one scale for every axis (or a flip), or offer the value as a vector", sides);
        continue;
      }
      const conv = { field: leaf.field, kind: leaf.kind, ...(leaf.rate ? { rate: /** @type {const} */ (true) } : {}), from: frameName(fromId), to: frameName(toId), fromId, toId, ...planOf(leaf.kind, path.edge) };
      wire.convert.push({ ...conv, text: convertText({ ...conv, edge: path.edge }) + notesOf(path) });
    }
  }

  for (const p of parts.values()) {
    if (broken.has(p)) continue;
    for (const i of Object.values(p.seams.in)) {
      if (!i.required || attempted.has(`${p.name}.${i.name}`)) continue;
      add(p.at, "S113", `the required input ${p.name}.in.${i.name} (${i.seamText}) has no wire`, `wire one: .wire(<part>.out.<port>, ${p.name}.in.${i.name})`, { to: { ...partSide(p), port: `in.${i.name}`, seam: i.seamText } });
    }
  }

  // a declared Control whose input nothing feeds: the person cannot play it here
  for (const x of withUI) {
    for (const [n, c] of Object.entries(/** @type {Record<string, any>} */ (/** @type {any} */ (x.ui).controls))) {
      if (c.local || attempted.has(`${x.name}.${c.input}`)) continue;
      add(x.part.at, "S120", `part '${x.name}' (${x.dialectName}) declares the Control '${n}', and nothing wires ${x.name}.in.${c.input}, so the person cannot play it in this composition`, `wire it: .wire(page.out.${n}, ${x.name}.in.${c.input}), or wire that input from another part`, { to: { ...partSide(x.part), port: `in.${c.input}` } }, "warning");
    }
  }

  // a cycle of wires needs one delayed wire in it; which wire the glue wrote last never decides it
  const order = [...parts.values()].map((p) => p.name);
  for (const { loop, hops } of undelayedLoops(order, wires.filter((w) => w.into === "in").map((w) => ({ from: w.from.part, to: w.to.part, delay: w.delay, wire: w, key: `${handleText(w.from)} ${handleText(w.to)}` })))) {
    const first = hops[0][0];
    /** @param {Wire[]} hop */
    const calls = (hop) => hop.map((w) => `.wire(${handleText(w.from)}, ${handleText(w.to)}, { delay: true })`).join(" and ");
    // delaying one of several parallel wires leaves the loop, so a fix delays all the wires of one hop; a layer's
    // inputs take no options, so a hop into a layer is never offered
    const delayable = hops.map((hop, i) => ({ hop, i })).filter(({ hop }) => !hop.some((w) => w.fixed));
    add(first.at, "S115", `the wires make a loop with no delay: ${loop.join(" → ")} (${hops.flat().map((w) => `${handleText(w.from)} → ${handleText(w.to)}`).join(", ")}); each part would wait on the other within one instant`, `mark every wire of one hop of the loop delayed, so its consumer reads the previous instant's snapshot: ${delayable.map(({ hop, i }) => `${loop[i]} → ${loop[i + 1]}: ${calls(hop)}`).join("; or ")}`, { from: side(first.from), to: side(first.to) });
  }

  // a param wire applies between instants, so a loop through a stepping part is no cycle; one of param wires alone is
  for (const { loop, wires: ring } of paramLoops(order, wires.filter((w) => w.into === "param").map((w) => ({ from: w.from.part, to: w.to.part, wire: w, key: `${handleText(w.from)} ${handleText(w.to)}` })))) {
    const first = ring[0];
    for (const w of ring) w.ok = false;
    const how = loop[0] === loop[1] ? `${handleText(first.from)} feeds ${handleText(first.to)}, a param of its own part` : `the param wires make a loop: ${loop.join(" → ")} (${ring.map((w) => `${handleText(w.from)} → ${handleText(w.to)}`).join(", ")})`;
    add(first.at, "S117", `${how}; a rebuild runs init, which can change the output that sets the param again, with no step between`, "set the param from another part's output, or wire the output to an input the part reads each step", { from: side(first.from), to: side(first.to) });
  }

  if (options.runtimes?.length) {
    // a param wire from a part that steps at a rate can change at every step, and each change rebuilds
    for (const w of wires.filter((x) => x.ok && x.into === "param")) {
      const pa = /** @type {Part} */ (parts.get(w.from.program));
      const rate = rateOf(options.runtimes.find((r) => r.dialect.name === pa.dialectName), pa.record, pa.name);
      if (rate) add(w.at, "S118", `${handleText(w.from)} → ${handleText(w.to)}: ${rate}, so ${handleText(w.from)} may change at every step, and each change sets ${w.to.part}.$.${w.to.name} and rebuilds ${w.to.part} when build-time code reads it`, `if the value changes rarely (a level, a mode), ignore this; if it changes often, wire it to an input of ${w.to.part}, which reads it each step`, { from: side(w.from), to: side(w.to) }, "warning");
    }
  }

  // with the parts' runtimes, each reliable Event wire's queue is sized from the clocks and per-step maxes
  if (options.runtimes?.length) {
    const live = wires.filter((w) => w.ok && w.into === "in");
    const sized = [...parts.values()].filter((p) => !broken.has(p) && p.record).map((p) => ({ name: p.name, dialect: p.dialectName, record: /** @type {Record<string, any>} */ (p.record) }));
    const ends = live.map((w) => ({ from: { part: w.from.part, name: w.from.name }, to: { part: w.to.part, name: w.to.name }, delivery: /** @type {Part} */ (parts.get(w.to.program)).seams.in[w.to.name]?.delivery }));
    for (const pr of queueProblems(sized, ends, [...options.runtimes, pageRuntimeFor(controls)], { catchUp: options.catchUp })) {
      const w = live[pr.wire];
      // a person is the one sender no party controls, so a page wire past its size folds rather than stops its consumer
      // (Ben, 2026-11-26): the composer is told, as with a policy, and the build goes on
      if (!w.overflow && isPageHandle(w.from)) {
        const delta = controls[w.from.name]?.records === "delta";
        const how = delta
          ? `carries over what a step cannot take: the step takes the first ${pr.max} in order and the rest wait for the next, each with its own $T (a ${controls[w.from.name]?.kind} Control's records are never dropped), counted in the run's stats().carried`
          : `folds: ${pr.max === 1 ? "a step takes only the latest of what is waiting" : `a step takes the first ${pr.max - 1} in order, then the latest`} (the Control's state now), counted in the run's stats().overflow`;
        add(w.at, "S116", `${pr.message}; a page wire past its size ${how}`, delta ? `if latency matters, ${pr.fix}; nothing is lost either way` : `if every change matters, ${pr.fix}; if only the latest state matters, ignore this`, { from: side(w.from), to: side(w.to) }, "warning");
        continue;
      }
      if (!w.overflow) { add(w.at, "S116", pr.message, `${pr.fix}; or, on this wire, { overflow: "keepLast" } (the newest ${pr.max} at each step) or { overflow: "keepFirst" } (the first ${pr.max})`, { from: side(w.from), to: side(w.to) }); continue; }
      const kept = w.overflow === "keepLast" ? `the newest ${pr.max}` : `the first ${pr.max}`;
      add(w.at, "S116", `${pr.message}; the wire's { overflow: "${w.overflow}" } keeps ${kept} at each step and drops the rest, counted in the run's stats().overflow${isPageHandle(w.from) ? "; on a page wire it replaces the page wire's fold, so the latest held state may not arrive (a button can stay down)" : ""}`, `if every record matters, ${pr.fix}, and remove overflow; if dropping is intended, ignore this`, { from: side(w.from), to: side(w.to) }, "warning");
    }
  }

  /** @type {Part | null} */
  let shown = null;
  for (const c of calls) {
    if (c.kind !== "show") continue;
    const program = layerOf(c.value)?.program ?? programOf(c.value);
    const p = program ? parts.get(program) : undefined;
    if (!p && isHandle(c.value) && c.value.side === "out") { add(c.at, "S102", `.show(${describe(c.value)}): one output alone is not a layer; show takes a part, a layer, or two or more Draw outputs to layer`, `show the part: .show(${c.value.part}), or layer two or more outputs: .show(<part>.out.<output>, <part>.out.<output>)`); continue; }
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
  const drawn = shownDraw(live, wires, parts, options);
  for (const d of drawn.problems) add(calls.find((c) => c.kind === "show")?.at ?? start, d.code, d.message, d.fix, d.sides);
  /** @type {Composed} */
  const record = {
    name,
    parts: [...parts.values()].filter((p) => !broken.has(p)).map((p) => (p.layer
      ? { name: p.name, dialect: LAYER, record: {}, layer: { inputs: p.layer.inputs.map(handleText), max: p.layer.max, frame: p.layer.frameNode } }
      : p === pagePart
        ? { name: p.name, dialect: p.dialectName, record: /** @type {Record<string, any>} */ (p.record), controls: Object.fromEntries(Object.entries(controls).map(([n, { parts: _, ...c }]) => [n, c])) }
        : { name: p.name, dialect: p.dialectName, ...(p.version ? { version: p.version } : {}), record: /** @type {Record<string, any>} */ (p.record), ...pointerOf(withUI.find((x) => x.part === p)?.ui) })),
    wires: wires.filter((w) => w.ok).map((w) => {
      // a param wire's `to` is `<part>.param.<name>`: kit/run applies it between instants
      const consumer = w.into === "in" ? /** @type {Part} */ (parts.get(w.to.program)).seams.in[w.to.name] : null;
      return { from: handleText(w.from), to: handleText(w.to), convert: w.convert.map(({ text: _, ...c }) => c), rename: w.rename, delay: w.delay, ...(w.overflow ? { overflow: w.overflow } : {}), dropped: w.dropped, ...(Object.keys(w.fill).length ? { fill: { ...w.fill } } : {}), ...(Object.keys(w.set).length ? { set: structuredClone(w.set) } : {}), ...(consumer?.delivery ? { delivery: consumer.delivery } : {}) };
    }),
    frames,
    show: live ? live.name : null,
    ...(drawn.view ? { view: drawn.view } : {}),
    ...(drawn.profile ? { profile: drawn.profile } : {}),
  };
  // the parts' records were built together: a call one glue helper makes for two parts is at one place in both
  const built = record.parts.map((p) => p.record).filter((r) => r && Object.keys(r).length);
  for (const r of built) BUILT_WITH.set(r, built);
  /** @param {Record<string, unknown>} o */
  const values = (o) => Object.entries(o).map(([k, v]) => `${k} = ${printValue(/** @type {any} */ (v))}`).join(", ");
  const plan = wires.filter((w) => w.ok).map((w) => `${handleText(w.from)} → ${handleText(w.to)}: ${w.convert.map((c) => c.text).join("; ") || "unchanged"}${w.dropped.length ? `; drops ${w.dropped.join(", ")}` : ""}${Object.keys(w.fill).length ? `; fills ${values(w.fill)}` : ""}${Object.keys(w.set).length ? `; sets ${values(w.set)}` : ""}${w.into === "param" ? "; sets the param between instants" : ""}${w.delay ? "; delayed" : ""}${w.overflow ? `; overflow ${w.overflow}` : ""}`);
  return { diagnostics: out, record, plan };
}

/** Literal data a wire constant may give: a number, a bool, a string, or a list of these. @param {unknown} v @returns {boolean} */
const literal = (v) => typeof v === "number" || typeof v === "boolean" || typeof v === "string" || (Array.isArray(v) && v.every(literal));

/**
 * A wire's options, or why they are not `{ rename?, set?, delay?, overflow? }`.
 * @param {unknown} o @returns {{ rename: Record<string, string>, set: Record<string, unknown>, delay: boolean, overflow: Overflow | null } | string}
 */
function wireOptions(o) {
  if (o === undefined) return { rename: {}, set: {}, delay: false, overflow: null };
  if (o === null || typeof o !== "object" || Array.isArray(o)) return "a wire's options are { rename?, set?, delay?, overflow? }";
  const x = /** @type {Record<string, unknown>} */ (o);
  const extra = Object.keys(x).filter((k) => !WIRE_OPTIONS.includes(k));
  if (extra.length) return `a wire takes only rename, set, delay and overflow, not ${extra.map((k) => `'${k}'`).join(", ")}.${didYouMean(extra[0], WIRE_OPTIONS)}`;
  const st = x.set;
  if (st !== undefined && (st === null || typeof st !== "object" || Array.isArray(st) || !Object.values(st).every(literal))) return `set is { consumerField: <value> }, each value a number, true or false, a string or a list of these, not ${describe(st)}`;
  if (x.delay !== undefined && typeof x.delay !== "boolean") return `delay is true or false, not ${describe(x.delay)}`;
  if (x.overflow !== undefined && !OVERFLOWS.includes(/** @type {string} */ (x.overflow))) return `overflow is "keepLast" (the newest records a step takes) or "keepFirst" (the first), not ${describe(x.overflow)}`;
  const r = x.rename;
  if (r !== undefined && (r === null || typeof r !== "object" || Array.isArray(r) || !Object.values(r).every((v) => typeof v === "string"))) return `rename is { producerField: "consumerField" }, not ${describe(r)}`;
  return { rename: /** @type {Record<string, string>} */ ({ ...(r ?? {}) }), set: { ...(/** @type {Record<string, unknown> | undefined} */ (st) ?? {}) }, delay: x.delay === true, overflow: /** @type {Overflow | undefined} */ (x.overflow) ?? null };
}

/**
 * Each producer field a wire drops that could stand in for a consumer field the wire fills with a default: the
 * seams compare clean field to field, so the glue likely forgot a rename. Top-level record fields only, which is
 * where a default can be. A rename is offered only when it would plan: `plans` says whether a tagged leaf has a
 * frame path.
 * @param {any} from @param {any} to @param {{ dropped: string[], filled: Record<string, unknown> }} cmp @param {(leaf: any) => boolean} plans
 * @returns {Array<{ from: string, to: string, type: string }>}
 */
function maskedRenames(from, to, cmp, plans) {
  const rec = (/** @type {any} */ s) => (s.kind === "event" ? s.of : s);
  const a = rec(from), b = rec(to);
  if (a.kind !== "record" || b.kind !== "record") return [];
  /** @type {Array<{ from: string, to: string, type: string }>} */
  const found = [];
  for (const d of cmp.dropped) {
    if (!Object.hasOwn(a.fields, d)) continue;
    for (const f of Object.keys(cmp.filled)) {
      if (Object.hasOwn(a.fields, f) || !Object.hasOwn(b.fields, f)) continue;
      const pair = compareSeams(a.fields[d], b.fields[f]);
      if (pair.problems.length === 0 && pair.tagged.every(plans)) found.push({ from: d, to: f, type: printSeam(b.fields[f]) });
    }
  }
  return found;
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
  const l = layerOf(v);
  if (l) return String(l.name);
  const p = programOf(v);
  if (p) return instanceName(/** @type {any} */ (p).root);
  return showValue(v);
}

/**
 * A part's pointer inputs, by Draw output, from its UI's stage and its view tiles: `{ pointer: { <output>: <input> } }`,
 * or nothing when it takes none.
 * @param {any} ui
 */
function pointerOf(ui) {
  /** @type {Record<string, string>} */
  const out = {};
  if (ui?.stage?.draw && ui.stage.pointer) out[ui.stage.draw] = ui.stage.pointer;
  /** @param {any[]} list */
  const walk = (list) => { for (const c of list ?? []) { if (c.kind === "view" && c.pointer) out[c.draw] = c.pointer; walk(c.items); } };
  for (const t of Object.values(ui?.tiles ?? {})) walk(/** @type {any} */ (t).body);
  return Object.keys(out).length ? { pointer: out } : {};
}
