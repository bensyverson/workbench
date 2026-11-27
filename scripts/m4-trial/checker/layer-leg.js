// The layer dogfood's compose check (leaf teBNYM): a glue written against the layer draft (kit/compose/README.md,
// "Layers (draft)"), which the real kit cannot load because the layer is not built. The glue is loaded as the page
// loads it, but with its kit/compose import resolved to layer-draft.js, which records the draft's calls and forwards
// the rest to a real composition. This file judges the records by the draft's rules where a program can (S101, S102,
// S111, S204, S251 and S404 with the draft's meaning; the leg's own T030–T033), then builds the real composition
// with the shown layer's bottom producer shown, and plays it with the compose leg's pad script. It cannot draw a
// layer, so the picture played is the bottom producer's; every hand-in is also read by hand.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { readPackageDir } from "../../pkg/dir.js";
import { textOf } from "../../../kit/package/index.js";
import { rewriteGlue } from "../../../kit/compose/index.js";
import { loadOnePackage } from "../../../kit/page/host/load.js";
import { moduleScope, withScope, isHandle } from "../../../kit/define/index.js";
import { programOf } from "../../../kit/define/grammar.js";
import { lowerRecord } from "../../../kit/define/lower.js";
import { instanceName } from "../../../kit/define/record.js";
import { parseSeam, FrameGraph, normalizeEdge, fitEdge, edgeText } from "../../../kit/seam/index.js";
import { parseModule, walkNodes } from "../../../kit/parse/module.js";
import { ENV } from "./env.js";
import { CheckTargetError, t, fromHost, done, readPackage, sameFiles, playPadScript } from "./legs.js";
import { recordOf, isLayer, isLayerHandle, handleName, LAYER_NAME } from "./layer-draft.js";

/** @typedef {import("./legs.js").Diagnostic} Diagnostic */
/** @typedef {import("./layer-draft.js").Layer} Layer */

const SHIM_URL = new URL("./layer-draft.js", import.meta.url).href;
const GLUE = "workbench.js";

/** @param {string} code @param {string} message @param {string} fix @param {number} [line] @returns {Diagnostic} */
const draft = (code, message, fix, line = 1) => ({ code, severity: "error", message: `(draft) ${message}`, fix, file: GLUE, line });

/** A built part's facts the draft needs: name, frames, built Draw maxes, extents and the Dialect's own edges. */
function partFacts(/** @type {any} */ program, /** @type {any} */ build) {
  const name = instanceName(program.root);
  const dialect = program.g.dialect;
  const frames = dialect.seams?.frames ?? {};
  try {
    const lowered = lowerRecord(program.g, program.build(build));
    const s = /** @type {any} */ (lowered.seams ?? {});
    return { name, dialect: String(dialect.name), frames, draws: s.draws ?? {}, extents: s.extents ?? {}, edges: s.edges ?? [], ok: true };
  } catch { return { name, dialect: String(dialect.name), frames, draws: {}, extents: {}, edges: [], ok: false }; }
}

/**
 * The layer leg's check.
 * @param {string} dir  the leg folder: workbench.js and the two given package folders, nothing else
 * @param {string[]} given  the two author packages as their legs left them: the game's, then the score's
 * @returns {Promise<import("./legs.js").CheckResult & { notes: string[] }>}
 */
export async function checkLayerCompose(dir, given) {
  if (!existsSync(dir)) throw new CheckTargetError(`${dir} does not exist`);
  const originals = given.map((g) => readPackage(g));
  /** @type {Diagnostic[]} */
  const out = [];
  /** @type {string[]} */
  const notes = [];
  const finish = () => ({ ...done(out), notes });
  /** @type {Record<string, Record<string, string | Uint8Array>>} */
  const packages = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".") && existsSync(join(dir, e.name, "wb-package.json"))) packages[e.name] = readPackageDir(join(dir, e.name));
  }
  const givenNames = given.map((g) => basename(g));
  givenNames.forEach((name, i) => {
    if (!packages[name]) out.push(t("T027", `the package ${name}/ you were given is not in the folder`, `put ${name}/ back as you were given it`, `${name}/wb-package.json`));
    else if (!sameFiles(packages[name], originals[i])) out.push(t("T027", `the package ${name}/ you were given was changed`, `restore ${name}/ as you were given it, and report what it lacked under Gaps`, `${name}/wb-package.json`));
  });
  for (const extra of Object.keys(packages).filter((n) => !givenNames.includes(n))) {
    out.push(t("T030", `${extra}/ is a package of your own; layering is built in, so this task allows no package beside the two you were given`, "delete it and layer the pictures in the glue (docs/kit/compose/README.md, Layers)", `${extra}/wb-package.json`));
    delete packages[extra];
  }
  const gluePath = join(dir, GLUE);
  if (!existsSync(gluePath)) { out.push(t("T020", "there is no workbench.js", "write the glue as workbench.js in your folder", GLUE)); return finish(); }
  const text = readFileSync(gluePath, "utf8");

  // the packages and the glue, loaded as kit/page/host's loadWorkbench does, with kit/compose resolved to the draft
  /** @type {any[]} */
  const loaded = [];
  for (const [label, files] of Object.entries(packages)) {
    const r = await loadOnePackage(label, files, ENV);
    out.push(...r.diagnostics.map((d) => fromHost(d, `${label}/wb-package.json`)));
    if (r.pkg) loaded.push(r.pkg);
  }
  if (out.some((d) => d.severity === "error")) return finish();
  /** @type {Record<string, string>} */
  const urls = { "kit/compose": SHIM_URL, "kit/define": ENV.urls.define };
  for (const p of loaded) {
    const grammar = JSON.parse(textOf(p.files["wb-package.json"]) ?? "{}").entry?.grammar;
    const url = p.urls.get(grammar);
    if (url !== undefined) urls[p.name] = url;
  }
  const rewritten = rewriteGlue(text, urls, GLUE);
  out.push(...rewritten.diagnostics.map((/** @type {any} */ d) => fromHost({ ...d, line: d.loc?.start?.line ?? d.line }, GLUE)));
  if (rewritten.text === null) return finish();
  /** @type {any} */
  let mod;
  try { mod = await ENV.importUrl(ENV.makeUrl(withScope(rewritten.text))); } catch (e) { out.push(t("LOAD", `workbench.js did not load: ${/** @type {Error} */ (e).message}`, "fix the syntax error", GLUE)); return finish(); }
  if (typeof mod.default !== "function") { out.push(t("S103", "the glue's default export is not a function", "export default () => compose(...)...", GLUE)); return finish(); }
  const trap = new Proxy({}, { get(_t, k) { if (typeof k === "symbol" || k === "then") return undefined; throw Object.assign(new Error(`a glue has no params: $.${String(k)}`), { code: "S104" }); } });
  /** @type {any} */
  let returned;
  try { returned = mod.default(trap); } catch (e) {
    const err = /** @type {any} */ (e);
    out.push(err?.code ? draft(err.code, err.message.replace(/^S\d+ /, ""), err.fix ?? "see docs/kit/compose/README.md", err.line ?? 1) : t("S103", `the glue threw: ${err?.message ?? err}`, "see the message", GLUE));
    return finish();
  }
  const rec = recordOf(returned);
  if (!rec) { out.push(t("S103", "the glue's default export returned something that is not a composition", "return compose(...)...", GLUE)); return finish(); }
  const build = moduleScope(text, mod);

  // the parts the glue added, built and lowered as kit/compose does, for their built maxes, extents and edges
  /** @type {Map<any, ReturnType<typeof partFacts>>} */
  const facts = new Map();
  /** @type {Map<string, any>} */
  const builderOf = new Map();
  for (const b of rec.builders) {
    const program = programOf(b);
    if (!program || facts.has(program)) continue;
    const f = partFacts(program, build);
    facts.set(program, f);
    builderOf.set(f.name, b);
  }
  const partNames = [...facts.values()].map((f) => f.name);
  const factsByName = new Map([...facts.values()].map((f) => [f.name, f]));

  // the frame graph: each part's frames and its Dialect's edges, then the glue's .frame calls
  const graph = new FrameGraph();
  for (const f of facts.values()) {
    for (const fr of Object.values(/** @type {Record<string, any>} */ (f.frames))) graph.addNode(`${f.name}.${fr.name}`, fr.dims);
    for (const e of f.edges) graph.add({ from: `${f.name}.${e.from}`, to: `${f.name}.${e.to}`, edge: e.edge, by: f.dialect });
  }
  for (const c of rec.frames) {
    const [a, b, edge] = /** @type {any[]} */ (c.args);
    if (!isHandle(a) || !isHandle(b)) continue;
    const fa = factsByName.get(a.part), fb = factsByName.get(b.part);
    if (!fa || !fb) continue;
    const dims = /** @type {any} */ (fa.frames)[a.name]?.dims;
    let e = null;
    if (edge === "fit") { const ea = /** @type {any} */ (fa.extents)[a.name], eb = /** @type {any} */ (fb.extents)[b.name]; if (ea && eb) e = fitEdge(ea, eb); }
    else { const n = normalizeEdge(edge, dims); if (n.ok) e = n.edge; }
    if (e) graph.add({ from: `${a.part}.${a.name}`, to: `${b.part}.${b.name}`, edge: e, by: "glue", glue: true, line: c.at.line });
  }

  // every layer the glue mentions, in order of first mention, nested ones included
  /** @type {Layer[]} */
  const layers = [];
  /** @param {unknown} v */
  const visit = (v) => {
    const l = isLayerHandle(v) ? v.layer : isLayer(v) ? v : null;
    if (!l || layers.includes(l)) return;
    layers.push(l);
    l.inputs.forEach(visit);
  };
  for (const c of [...rec.shows, ...rec.layerParts, ...rec.layerWires]) c.args.forEach(visit);

  /** A Draw output handle's frame, max and producer part. @param {any} h */
  const drawOf = (h) => {
    const seam = /** @type {any} */ (parseSeam(h.seam ?? ""))?.type;
    const f = factsByName.get(h.part);
    const max = /** @type {any} */ (f?.draws)?.[h.name]?.max ?? seam?.max;
    return { frame: `${h.part}.${seam?.frame}`, max };
  };
  /** @type {Map<Layer, { frame: string, max: number, leaves: any[] }>} */
  const solved = new Map();
  /** A layer's frame (its bottom input's), summed max and leaf outputs, bottom first. @param {Layer} l @param {Layer[]} [seen] @returns {{ frame: string, max: number, leaves: any[] } | null} */
  const solve = (l, seen = []) => {
    if (solved.has(l)) return /** @type {any} */ (solved.get(l));
    if (seen.includes(l)) return null;
    let max = 0, frame = "";
    /** @type {any[]} */
    const leaves = [];
    for (const [i, x] of l.inputs.entries()) {
      let one;
      if (isLayerHandle(x)) { const s = solve(x.layer, [...seen, l]); if (!s) return null; one = s; leaves.push(...s.leaves); }
      else if (isHandle(x) && /** @type {any} */ (x).side === "out" && String(/** @type {any} */ (x).seam ?? "").startsWith("Draw")) { one = drawOf(x); leaves.push(x); }
      else return null;
      max += one.max ?? 0;
      if (i === 0) frame = one.frame;
    }
    const r = { frame, max, leaves };
    solved.set(l, r);
    return r;
  };

  const names = new Map(partNames.map((n) => [n, "part"]));
  for (const l of layers) {
    const line = l.at.line;
    const what = l.shorthand ? `.show(${l.inputs.map(handleName).join(", ")})` : `layer(${JSON.stringify(l.name)}, ...)`;
    if (typeof l.name !== "string" || !LAYER_NAME.test(l.name)) out.push(draft("S102", `${what}: a layer's name is lowercase letters, digits and -`, 'layer("<name>", <output>, <output>)', line));
    else if (names.has(l.name)) out.push(draft("S101", `${what}: two parts are named '${l.name}'`, l.shorthand ? "the shorthand's layer is named layers: name the layer yourself with layer(<name>, ...) and .show(<layer>)" : "rename the layer", line));
    else names.set(l.name, "layer");
    if (l.inputs.length < 2) out.push(draft("S102", `${what}: a layer takes two or more Draw outputs, not ${l.inputs.length}`, "show one picture with .show(<part>); layer two or more", line));
    const seenInputs = new Set();
    for (const x of l.inputs) {
      const n = handleName(x);
      if (seenInputs.has(n)) out.push(draft("S102", `${what}: ${n} is given twice`, "give each output once", line));
      seenInputs.add(n);
      if (isLayerHandle(x)) continue;
      if (!isHandle(x) || /** @type {any} */ (x).side !== "out") { out.push(draft("S102", `${what}: ${n} is not an output handle`, "pass <part>.out.<output> handles, bottom first", line)); continue; }
      const h = /** @type {any} */ (x);
      if (!partNames.includes(h.part)) out.push(draft("S102", `${what}: ${n} is a handle of a part not added`, `.part(<the ${h.dialect} builder>)`, line));
      if (!String(h.seam ?? "").startsWith("Draw")) out.push(draft("S404", `${what}: ${n} is ${h.seam ?? "not a seam"}, not a Draw list`, "a layer takes only Draw outputs", line));
    }
    const s = solve(l);
    if (!s) continue;
    const bottomExtent = (() => { const [p, fr] = s.frame.split("."); return /** @type {any} */ (factsByName.get(p)?.extents)?.[fr]; })();
    notes.push(`layer ${l.name}: Draw<${s.max}>@${s.frame}${bottomExtent ? `, page box ${bottomExtent.max.map((/** @type {number} */ v, /** @type {number} */ i) => v - bottomExtent.min[i]).join(" by ")}` : ""}`);
    l.inputs.forEach((x, i) => {
      const from = isLayerHandle(x) ? /** @type {any} */ (solve(x.layer))?.frame : isHandle(x) ? drawOf(x).frame : null;
      if (!from) return;
      const path = from === s.frame ? null : graph.path(from, s.frame);
      if (from !== s.frame && !path) out.push(draft("S251", `${what}: ${handleName(x)} is drawn in ${from}, and no frame path joins it to the bottom layer's frame, ${s.frame}`, `relate the two with .frame(<${from.replace(".", ".frame.")}>, <${s.frame.replace(".", ".frame.")}>, { scale: …, offset: … }) or "fit"`, line));
      notes.push(`  ${handleName(x)} → ${l.name}.in.${i}: ${from === s.frame ? "unchanged" : path ? `${from} → ${s.frame}, draw, ${edgeText(path.edge)}` : "no frame path"}`);
    });
  }

  for (const c of rec.layerWires) {
    const [from, to] = /** @type {any[]} */ (c.args);
    if (!isLayerHandle(from)) { out.push(draft("S102", `.wire(${handleName(from)}, ${handleName(to)}): a layer is wired from its output, <layer>.out.view, and takes no wire into it`, "pass outputs to layer(<name>, ...)", c.at.line)); continue; }
    const s = solve(from.layer);
    const h = /** @type {any} */ (to);
    if (!s || !isHandle(h) || h.side !== "in") { out.push(draft("S102", `.wire(${handleName(from)}, ${handleName(to)}): the consumer is not an input handle`, ".wire(<layer>.out.view, <part>.in.<Draw input>)", c.at.line)); continue; }
    const seam = /** @type {any} */ (parseSeam(h.seam ?? ""))?.type;
    if (seam?.kind !== "draw") out.push(draft("S201", `.wire(${handleName(from)}, ${handleName(to)}): ${handleName(to)} is ${h.seam}, not a Draw input`, "wire a layer into a Draw input", c.at.line));
    else if (seam.max < s.max) out.push(draft("S204", `.wire(${handleName(from)}, ${handleName(to)}): the layer can hold ${s.max} ops; ${handleName(to)} takes ${seam.max}`, "raise the input's max", c.at.line));
    notes.push(`.wire(${handleName(from)}, ${handleName(to)}) at line ${c.at.line} is judged by the draft only; the play does not carry it`);
  }

  // what is shown
  /** @type {Layer | null} */
  let shown = null;
  if (rec.shows.length === 0) out.push(t("T020", "the glue shows nothing", ".show(<layer>) or .show(<output>, <output>)", GLUE));
  if (rec.shows.length > 1) out.push(draft("S102", ".show is called twice", "show one part or one layer", rec.shows[1].at.line));
  const first = rec.shows[0];
  if (first) {
    const args = first.args;
    if (args.length === 1 && isLayer(args[0])) shown = args[0];
    else if (args.length === 1 && isLayerHandle(args[0])) out.push(draft("S102", `.show(${handleName(args[0])}): show the layer itself`, `.show(${args[0].layer.name})`, first.at.line));
    else if (args.length === 1 && isHandle(args[0])) out.push(draft("S102", `.show(${handleName(args[0])}): one output alone is not a layer`, "show the part, or layer two or more outputs", first.at.line));
    else if (args.length === 1) rec.real.show(args[0]);
    else out.push(draft("S102", `.show(${args.map(handleName).join(", ")}): show one part, one layer, or two or more Draw outputs`, ".show(<layer>) or .show(<output>, <output>)", first.at.line));
  }
  const shownSolved = shown ? solve(shown) : null;
  if (shownSolved) {
    const bottom = shownSolved.leaves[0];
    const builder = builderOf.get(bottom.part);
    if (builder) rec.real.show(builder);
  }

  // the copied numbers the draft makes unnecessary: a producer's built max, a layer's sum, the bottom frame's extent
  const copied = new Map();
  for (const [program, f] of facts) {
    for (const [port, o] of Object.entries(/** @type {Record<string, any>} */ (program.g.dialect.seams?.out ?? {}))) if (o.seam?.kind === "draw") copied.set(o.seam.max, `the ${f.dialect} Dialect's declared ceiling for ${port}`);
    for (const [port, d] of Object.entries(/** @type {Record<string, any>} */ (f.draws))) copied.set(d.max, `${f.name}.out.${port}'s built max`);
  }
  for (const l of layers) { const s = solved.get(l); if (s) copied.set(s.max, `${l.name}'s summed max`); }
  if (shownSolved) {
    const [p, fr] = shownSolved.frame.split(".");
    const ext = /** @type {any} */ (factsByName.get(p)?.extents)?.[fr];
    if (ext) ext.max.forEach((/** @type {number} */ v, /** @type {number} */ i) => { const size = v - ext.min[i]; if (!copied.has(size)) copied.set(size, `${shownSolved.frame}'s extent`); });
  }
  try {
    walkNodes(parseModule(text), (node) => {
      const n = /** @type {any} */ (node);
      if (n.type !== "Literal") return;
      if (typeof n.value === "string" && /Draw</.test(n.value)) out.push({ ...t("T031", `a Draw seam is written in the glue (${JSON.stringify(n.value)})`, "the layer takes its ceilings from the producers; write none", GLUE, n.loc.start.line), severity: "warning" });
      if (typeof n.value === "number" && n.value > 16 && copied.has(n.value)) out.push({ ...t("T031", `${n.value} is ${copied.get(n.value)}; the layer derives it`, "a review flag: if the number was copied from a producer, remove it", GLUE, n.loc.start.line), severity: "warning" });
    });
  } catch { /* the load above already reported a syntax error */ }

  if (out.some((d) => d.severity === "error")) return finish();

  // the real composition, with the shown layer's bottom producer shown
  const runtimes = loaded.map((p) => p.loaded.runtime).filter(Boolean);
  const options = { packages: loaded.map((p) => p.loaded), build, runtimes };
  // kit/compose places a diagnostic at the innermost frame outside its own modules, which for a forwarded call is the
  // stand-in's line; place it at the glue call whose handles name the diagnostic's sides instead
  /** @param {any} d */
  const lineOf = (d) => {
    if (!String(d.file ?? "").endsWith("layer-draft.js")) return d.loc?.start?.line;
    const sides = [d.from, d.to].filter(Boolean).map((s) => `${s.part}.${s.port ?? s.frame ?? ""}`);
    /** @param {any} h */
    const key = (h) => (isHandle(h) ? `${/** @type {any} */ (h).part}.${/** @type {any} */ (h).side === "frame" ? "" : `${/** @type {any} */ (h).side}.`}${/** @type {any} */ (h).name}` : programOf(h) ? `${instanceName(/** @type {any} */ (programOf(h)).root)}.` : "");
    let best = null, score = 0;
    for (const c of [...rec.wires, ...rec.frames, ...rec.partCalls]) {
      const keys = c.args.map(key);
      const n = sides.filter((s) => keys.includes(s)).length;
      if (n > score) { best = c; score = n; }
    }
    return best ? best.at.line : 1;
  };
  const found = rec.real.check(options).map((/** @type {any} */ d) => fromHost({ ...d, file: GLUE, line: lineOf(d) }, GLUE));
  out.push(...found);
  if (found.some((/** @type {Diagnostic} */ d) => d.severity === "error")) return finish();
  const c = rec.real.build(options);
  const [gameName, scoreName] = originals.map((f) => JSON.parse(textOf(f["wb-package.json"]) ?? "{}").name);
  /** @param {string} d */
  const partsOf = (d) => c.parts.filter((/** @type {any} */ p) => p.dialect === d).map((/** @type {any} */ p) => p.name);
  const gameParts = partsOf(gameName), scoreParts = partsOf(scoreName);
  for (const [d, ps] of /** @type {[string, string[]][]} */ ([[gameName, gameParts], [scoreName, scoreParts]])) if (!ps.length) out.push(t("T021", `no part of the composition is a ${d}`, `add a ${d} part with .part(<builder>)`, GLUE));
  /** @param {string} end */
  const partOf = (end) => end.split(".")[0];
  const wires = c.wires.map((/** @type {any} */ x) => ({ from: x.from, to: x.to, fromPart: partOf(x.from), toPart: partOf(x.to) }));
  if (!wires.some((/** @type {any} */ x) => x.from === "page.out.pad" && gameParts.includes(x.toPart))) out.push(t("T022", "the page's pad is not wired to the game", ".wire(page.out.pad, <game part>.in.<its pad input>)", GLUE));
  if (!wires.some((/** @type {any} */ x) => gameParts.includes(x.fromPart) && scoreParts.includes(x.toPart))) out.push(t("T023", "nothing the game sends is wired to the score-and-timer", ".wire(<game part>.out.<output>, <score part>.in.<input>)", GLUE));
  if (!shownSolved) out.push(t("T032", "the glue does not show a layer of both pictures", ".show(<game part>.out.<Draw output>, <score part>.out.<Draw output>)", GLUE));
  else {
    const at = (/** @type {string[]} */ ps) => shownSolved.leaves.findIndex((h) => ps.includes(h.part));
    const g = at(gameParts), s = at(scoreParts);
    if (g < 0 || s < 0) out.push(t("T032", `the shown layer, ${shown?.name}, does not take both pictures`, "layer a Draw output of the game and one of the score-and-timer", GLUE));
    else if (s < g) out.push(t("T033", `the shown layer draws the score-and-timer's picture under the game's; the task draws the score over the game`, "painter's order: give the game's output first (bottom)", GLUE));
  }
  if (out.some((d) => d.severity === "error")) return finish();
  notes.push(`the play shows ${partOf(c.show)}, the shown layer's bottom producer: the layer is not built, so the checker cannot draw it`);
  out.push(...(await playPadScript({ composed: c, runtimes, packages: loaded.map((p) => p.loaded) }, scoreParts)));
  return finish();
}
