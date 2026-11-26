// One leg of the draw-list paper trial (leaf e3qYus), on the real kit with Draw emulated (define.js). An author leg:
// the seams relay's checks of the package (scripts/seams-trial/checker/legs.js), then the Draw output: its
// declaration (W001, W002), its builders' source (W003, static W005), and the list it builds after every step of
// each example's run, typed (W004), within its max (W005), without a throw (W006) and showing the run (W010), drawn
// by the Canvas stub and the Game Boy profile. A compose leg: the three packages and the glue through kit/compose
// (the stand-in ports give S codes, printed with the Draw seams), the shown root and its Draw wires (W020 to W022),
// then the run: the D-pad steers the maze's player to a coin, and after each step the producers' lists cross their
// wires (colors resolved, images qualified, converted by the wire's frame edge) into the root's builder; its list is
// typed, held to its max, needs a text op (W023) and a burst over the maze at the coin (W024); then a replay.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { run as runProgram } from "../../../kit/define/index.js";
import { createRun, replay, carry } from "../../../kit/run/index.js";
import { MANIFEST_PATH } from "../../../kit/package/index.js";
import { fitEdge } from "../../../kit/seam/index.js";
import { buildOptions } from "../../pkg-trial/checker/scope.js";
import { checkLeg as seamsCheckLeg } from "../../seams-trial/checker/legs.js";
import { loadPackageDir, loadCompose } from "../../seams-trial/checker/load.js";
import { catching, steerToCoin, startRun } from "../../seams-trial/checker/runs.js";
import { installDrawHooks } from "./hook.js";
import { draws } from "./define.js";
import { builderOf, staticMax, scanBuilder, runBuilder } from "./builders.js";
import { typeOp, checkPaint, carryOp, convertOp, opBox } from "./ops.js";
import { canvas, gameboy, gameboyAtCompose, GB } from "./render.js";

/** @typedef {import("../../seams-trial/checker/load.js").Found} Found */
/** @typedef {{ diagnostics: Found[], plan: string[], notes: string[] }} LegResult */
/** @typedef {import("./define.js").DrawDecl} DrawDecl */

/** Seconds each example runs; the D-pad's limit; how soon after the pickup the burst must be drawn. */
const RUN_FOR = 2, REACH = { example: 20, compose: 30 }, BURST_WITHIN = 0.5;
/** The minor version an author leg raises its package to (from 0.2). */
const MINOR = 3;
/** At most this many of one kind of problem are printed; the rest are counted. */
const SHOW = 3;

const num = (/** @type {number} */ v) => String(Math.round(v * 1000) / 1000);
const pt = (/** @type {number[]} */ p) => `(${p.map(num).join(", ")})`;

/**
 * Checks one leg.
 * @param {string} dir  a package folder (maze, particles), or the compose leg's folder
 * @param {"maze" | "particles" | "compose"} role
 * @returns {Promise<LegResult>}
 */
export async function checkLeg(dir, role) {
  installDrawHooks();
  return role === "compose" ? checkComposeLeg(dir) : checkAuthorLeg(dir, role);
}

/** Problems of one kind gathered, printed once each with a count. */
class Tally {
  constructor() { /** @type {Map<string, { found: Found, n: number }>} */ this.by = new Map(); }
  /** @param {Found} f */
  add(f) { const k = `${f.code} ${f.message}`; const e = this.by.get(k); if (e) e.n++; else this.by.set(k, { found: f, n: 1 }); }
  /** @returns {Found[]} */
  list() {
    /** @type {Map<string, number>} */
    const perCode = new Map();
    /** @type {Found[]} */
    const out = [];
    for (const { found, n } of this.by.values()) {
      const c = (perCode.get(found.code) ?? 0) + 1;
      perCode.set(found.code, c);
      if (c <= SHOW) out.push(n > 1 ? { ...found, message: `${found.message} (${n} times)` } : found);
    }
    for (const [code, c] of perCode) if (c > SHOW) out.push({ file: out.find((f) => f.code === code)?.file ?? "", line: 1, code, message: `and ${c - SHOW} more ${code} problems like these`, fix: "fix the ones above and rerun" });
    return out;
  }
}

/** The line in a file where a port or key is declared (`<name>:`), or 1. @param {string} text @param {string} name */
function lineOfKey(text, name) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => new RegExp(`(^|[\\s{,])["']?${name.replace(/[$]/g, "\\$")}["']?\\s*:`).test(l));
  return i < 0 ? 1 : i + 1;
}

/**
 * An example's builder, built at its params' declared values, and its build options.
 * @param {(path: string) => Promise<any>} importModule @param {string} path
 */
async function exampleOf(importModule, path) {
  const mod = await importModule(path);
  const build = buildOptions(path, mod);
  const built = runProgram(mod.default, build);
  const values = Object.fromEntries(Object.entries(built.record?.params ?? {}).map(([k, v]) => [k, /** @type {any} */ (v).value]));
  return { builder: mod.default(Object.freeze(values)), record: built.record, build };
}

/** The names a builder of this Dialect may read besides its parameters: its globals, but not $ or the inputs. @param {DrawDecl} d */
const allowedOf = (d) => new Set(d.globals.filter((g) => g !== d.params && g !== d.inputs));

/**
 * A Dialect's Draw declarations checked: W002 for each port, colors and images, W003 for each builder's source, a
 * static W005 where the source says the list can pass its max. Returns each Draw output's builder.
 * @param {DrawDecl} d @param {string} file the Dialect file's path @param {string} text its source @param {Found[]} found
 */
function checkDecl(d, file, text, found) {
  const at = (/** @type {string} */ code, /** @type {string} */ message, /** @type {string} */ fix, line = 1) => found.push({ file, line, code, message, fix });
  for (const p of d.problems) at("W002", p.message, "see draw.md, \"The seam type\"", p.port ? lineOfKey(text, p.port) : 1);
  for (const m of checkPaint(d.rawPaint)) at("W002", m, "see draw.md, \"Naming colors and declaring images\"", lineOfKey(text, m.startsWith("colors") ? "colors" : "images"));
  const inMaxes = Object.fromEntries(Object.entries(d.ins).map(([k, v]) => [k, v.max]));
  /** @type {Record<string, import("./builders.js").Builder>} */
  const builders = {};
  for (const [name, o] of Object.entries(d.outs)) {
    const b = builderOf(o.port, d.state, o.max);
    for (const m of b.problems) at("W002", `output '${name}': ${m}`, "see draw.md, \"Building a draw list\"", lineOfKey(text, name));
    for (const l of b.layers) {
      for (const s of scanBuilder(String(l.fn), { fileText: text, allowed: allowedOf(d) })) at(s.code, `output '${name}', ${l.at}: ${s.message}`, s.fix, s.line);
      if (l.kind !== "whole" && Object.keys(d.ins).length && l.fn.length > 2) at("W002", `output '${name}', ${l.at}: only a whole-list builder gets the Draw inputs`, "read the inputs in a { from: (s, <inputs>) => [...] } layer", lineOfKey(text, name));
    }
    const m = staticMax(b, inMaxes);
    if (m !== null && m > o.max) at("W005", `output '${name}' is Draw<${o.max}>, and its builders can make ${m} ops`, `raise the seam's max to at least ${m}, or make fewer ops`, lineOfKey(text, name));
    if (!b.problems.length) builders[name] = b;
  }
  return builders;
}

/**
 * One list built and typed: the ops, and its problems added to `tally` (W004, W005, W006).
 * @param {import("./builders.js").Builder} b @param {any} state @param {Record<string, any[]>} inputs
 * @param {{ name: string, max: number, paint: any, file: string, line: number, when: string, skip?: Set<any> }} o @param {Tally} tally
 */
function buildAndType(b, state, inputs, o, tally) {
  const r = runBuilder(b, state, inputs);
  for (const p of r.problems) tally.add({ file: o.file, line: o.line, code: /threw/.test(p) ? "W006" : "W005", message: `output '${o.name}' ${o.when}: ${p}`, fix: /threw/.test(p) ? "make the builder run on every state your runtime makes" : "draw fewer ops, or raise the max" });
  for (const op of r.ops) {
    if (o.skip?.has(op)) continue;
    for (const m of typeOp(op, o.paint)) tally.add({ file: o.file, line: o.line, code: "W004", message: `output '${o.name}': ${m}`, fix: "see draw.md, \"Draw ops\"" });
  }
  if (r.ops.length > o.max) tally.add({ file: o.file, line: o.line, code: "W005", message: `output '${o.name}' ${o.when} holds ${r.ops.length} ops; its seam is Draw<${o.max}>`, fix: "a list is never truncated: raise the max or draw fewer ops" });
  return r;
}

/** Images of a Dialect named as they are once carried: `<part>.<image>`. @param {DrawDecl} d @param {string} part */
const imagesOf = (d, part) => Object.fromEntries(Object.entries(d.images).map(([k, v]) => [`${part}.${k}`, v]));
/** @param {number[]} p @param {{ min: number[], max: number[] }} b @param {number} [pad] */
const inside = (p, b, pad = 0) => p[0] >= b.min[0] - pad && p[0] <= b.max[0] + pad && p[1] >= b.min[1] - pad && p[1] <= b.max[1] + pad;

/**
 * @param {string} dir @param {"maze" | "particles"} role
 * @returns {Promise<LegResult>}
 */
async function checkAuthorLeg(dir, role) {
  const base = await seamsCheckLeg(dir, role);
  const notes = [...base.notes];
  /** @type {Found[]} */
  const found = base.diagnostics.filter((d) => !["G002", "G003", "G004"].includes(d.code));
  if (found.some((d) => /^(K|D|B|L|U|LOAD)/.test(d.code))) return { diagnostics: found, plan: [], notes };
  const { loaded, importModule } = await loadPackageDir(dir);
  if (loaded.diagnostics?.length) return { diagnostics: found, plan: [], notes };
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), "utf8"));
  const [major, minor] = String(manifest.version).split(".").map(Number);
  if (!(major > 0 || minor >= MINOR)) found.push({ file: MANIFEST_PATH, line: 1, code: "W030", message: `version ${manifest.version}: the package adds to its language, so its minor version is raised`, fix: `"version": "0.${MINOR}.0"` });
  const file = manifest.entry.dialect, text = readFileSync(join(dir, file), "utf8");
  const d = draws.get(loaded.name);
  const builders = d ? checkDecl(d, file, text, found) : {};
  if (!d || !Object.keys(d.outs).length) {
    found.push({ file, line: lineOfKey(text, "out"), code: "W001", message: "the Dialect offers no Draw output: the task asks for its picture as a draw list (ports.out)", fix: '<port>: { seam: "Draw<<max>>@<frame>", note: "<…>", <builder> }' });
    return { diagnostics: found, plan: [], notes };
  }
  if (!loaded.runtime) return { diagnostics: found, plan: [], notes };
  const tally = new Tally();
  /** Ports whose composition-time Game Boy note is printed. */
  const once = new Set();
  const pkgInfo = [{ name: loaded.name, content: loaded.content, version: loaded.version }];
  for (const path of loaded.examples) {
    const ex = await exampleOf(importModule, path);
    const s = startRun({ builders: [ex.builder], show: ex.builder, runtimes: [loaded.runtime], build: ex.build, packages: pkgInfo });
    if (!s.run) continue;
    const part = s.composed.parts[0].name;
    /** @type {Array<{ T: number, state: any }>} */
    const states = [];
    const keep = (/** @type {any} */ i) => { if (i.stepped.includes(part)) states.push({ T: s.run.seconds, state: s.run.state(part) }); };
    if (role === "maze") steerToCoin(s.run, part, s.composed.parts[0].record.grid, REACH.example, keep);
    while (s.run.seconds < RUN_FOR) { const i = s.run.step(); if (!i) break; keep(i); }
    const extents = loaded.grammar.lower(ex.record).seams?.extents ?? {};
    for (const [name, b] of Object.entries(builders)) {
      const o = d.outs[name];
      const paint = { colors: d.colors, images: d.images };
      /** @type {{ T: number, ops: any[] } | null} */
      let largest = null;
      let shown = false, checked = 0;
      for (const { T, state } of states) {
        if (!state) continue;
        const r = buildAndType(b, state, {}, { name, max: o.max, paint, file, line: lineOfKey(text, name), when: `at T = ${num(T)} in ${path}` }, tally);
        if (!largest || r.ops.length > largest.ops.length) largest = { T, ops: r.ops };
        const ok = r.ops.filter((op) => !typeOp(op, paint).length);
        const boxes = ok.map((op) => opBox(op, d.images));
        if (role === "maze") {
          const p = [state.player.x, state.player.y];
          checked++;
          if (boxes.some((bx) => inside(p, bx))) shown = true;
        } else if (state.particles?.length) {
          const box = extents[o.frame];
          const diag = box ? Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1]) : 100;
          const sample = state.particles.slice(0, 5);
          checked++;
          if (sample.every((/** @type {any} */ q) => boxes.some((bx) => inside([q.x, q.y], bx, diag / 50)))) shown = true;
        }
      }
      if (checked && !shown) found.push({ file, line: lineOfKey(text, name), code: "W010", message: role === "maze" ? `output '${name}' in ${path}: no op covers the player's cell, at any step` : `output '${name}' in ${path}: no step's list draws something near each of its first live particles`, fix: role === "maze" ? "draw the player where state.player is, in the port's frame" : "draw each live particle where it is, in the port's frame" });
      if (!largest) continue;
      const box = extents[o.frame];
      const carried = largest.ops.filter((op) => !typeOp(op, paint).length).map((op) => carryOp(op, paint, part));
      const images = imagesOf(d, part);
      notes.push(`${path}: ${name}: largest list ${largest.ops.length} of Draw<${o.max}>, at T = ${num(largest.T)}`);
      if (box) {
        notes.push(`  canvas (${o.frame}, one unit a pixel): ${canvas(carried, { box, images }).text}`);
        const fit = fitEdge(box, { min: [0, 0], max: [GB.width, GB.height] });
        // a package's list is not the shown one, so draw.md's "one unit a pixel" has no screen to apply to: the
        // checker fits the frame's extent to the Game Boy screen to try the profile, and says so (the maze leg read
        // the earlier "fit into" note as contradicting draw.md)
        notes.push(`  gameboy (not a shown list: the checker fits ${o.frame}'s extent into the ${GB.width} by ${GB.height} screen, ×${num(fit.scale[0])}, to try the profile): ${gameboy(carried.map((op) => convertOp(op, fit)), { box: { min: [0, 0], max: [GB.width, GB.height] }, images }).text}`);
      } else notes.push(`  canvas: frame ${o.frame} has no extent, so the stage has no size; drawn without a box`);
      const atCompose = gameboyAtCompose(o.max);
      if (atCompose && !once.has(name)) { once.add(name); notes.push(`  gameboy at composition: ${atCompose}`); }
    }
  }
  found.push(...tally.list());
  return { diagnostics: found, plan: [], notes };
}

/** A diagnostic's text with each stand-in Event seam of a Draw port printed as that port's Draw seam. @param {string} s */
function asDraw(s) {
  return s.replace(/Event<\{ at: point2@(\w+) \}>/g, "Draw<…>@$1");
}

/**
 * @param {string} dir
 * @returns {Promise<LegResult>}
 */
async function checkComposeLeg(dir) {
  /** @type {string[]} */
  const notes = [];
  const roots = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !["maze", "particles"].includes(e.name) && !e.name.startsWith(".") && existsSync(join(dir, e.name, MANIFEST_PATH))).map((e) => e.name);
  if (roots.length !== 1) return { diagnostics: [{ file: ".", line: 1, code: "W020", message: roots.length ? `${roots.length} root package folders (${roots.join(", ")}); hand in one` : "no root package: hand in one folder, named as its package, beside maze/ and particles/", fix: "see task.md" }], plan: [], notes };
  const rootName = roots[0];
  const r = await loadCompose(dir, ["maze", "particles", rootName]);
  const diagnostics = r.diagnostics.map((d) => ({ ...d, message: asDraw(d.message), ...(d.sides ? { sides: d.sides.map(asDraw) } : {}), ...(d.fix ? { fix: asDraw(d.fix) } : {}) }));
  /** @type {Found[]} */
  const found = [];
  // the root's own Draw declarations, even when the composition is refused
  const rootDecl = draws.get(rootName);
  const rootManifest = existsSync(join(dir, rootName, MANIFEST_PATH)) ? JSON.parse(readFileSync(join(dir, rootName, MANIFEST_PATH), "utf8")) : null;
  const rootFile = rootManifest ? `${rootName}/${rootManifest.entry.dialect}` : rootName;
  const rootText = rootManifest ? readFileSync(join(dir, rootFile), "utf8") : "";
  const rootBuilders = rootDecl ? checkDecl(rootDecl, rootFile, rootText, found) : {};
  if (diagnostics.length || !r.composition) return { diagnostics: [...diagnostics, ...found], plan: r.plan.map(asDraw), notes };
  found.unshift(...diagnostics);
  const byName = Object.fromEntries(r.loaded.map((p) => [p.name, p]));
  if (r.loaded.some((p) => !p.runtime)) return { diagnostics: [...found, { file: "workbench.js", line: 1, code: "G001", message: "a package has no runtime, so the workbench cannot run", fix: "give your root package a runtime (runtime.md)" }], plan: r.plan, notes };
  const composed = r.composition.build({ ...r.options, runtimes: r.loaded.map((p) => p.runtime) });
  const partOf = (/** @type {string} */ n) => composed.parts.find((/** @type {any} */ p) => p.name === n);
  const [mz] = composed.parts.filter((/** @type {any} */ p) => p.dialect === "maze");
  const [fx] = composed.parts.filter((/** @type {any} */ p) => p.dialect === "particles");
  const [root] = composed.parts.filter((/** @type {any} */ p) => p.dialect === rootName);
  const ends = (/** @type {string} */ s) => { const [part, side, port] = s.split("."); return { part, side, port, dialect: partOf(part)?.dialect }; };
  const drawOut = (/** @type {any} */ e) => draws.get(e.dialect)?.outs[e.port];
  const drawIn = (/** @type {any} */ e) => draws.get(e.dialect)?.ins[e.port];
  /** @type {any[]} */
  const drawWires = [];
  for (const w of composed.wires) {
    const a = ends(w.from), b = ends(w.to);
    const o = drawOut(a), i = drawIn(b);
    if (!o && !i) continue;
    if (!o || !i) { found.push({ file: "workbench.js", line: 1, code: "W021", message: `${w.from} cannot feed ${w.to}: ${o ? "a draw list into a port that is not a Draw input" : "a port that is not a Draw output into a Draw input"}`, fix: ".wire(<part>.out.<Draw output>, <root>.in.<Draw input>)" }); continue; }
    if (o.max > i.max) found.push({ file: "workbench.js", line: 1, code: "W021", message: `${w.from} (Draw<${o.max}>) cannot feed ${w.to} (Draw<${i.max}>): the output's list can be longer than the input takes`, fix: `raise ${w.to}'s max to at least ${o.max} in your root's Dialect` });
    drawWires.push({ w, a, b, o, i, edge: { scale: w.convert[0]?.scale ?? [1, 1], offset: w.convert[0]?.offset ?? [0, 0] } });
    notes.push(`draw ${w.from} → ${w.to}: Draw<${o.max}>@${o.frame} into Draw<${i.max}>@${i.frame}${w.convert[0] ? `, ${w.convert[0].from} → ${w.convert[0].to} ×${w.convert[0].scale.map(num).join(",")} +${w.convert[0].offset.map(num).join(",")}` : ""}`);
  }
  const rootOuts = Object.keys(rootDecl?.outs ?? {});
  const viewName = rootOuts.length === 1 ? rootOuts[0] : rootOuts.includes("view") ? "view" : null;
  if (!root || composed.show !== root.name) found.push({ file: "workbench.js", line: 1, code: "W020", message: `the page shows '${composed.show}', not your root part`, fix: ".show(<root part>)" });
  else if (!viewName) found.push({ file: rootFile, line: 1, code: "W020", message: rootOuts.length ? `your root has ${rootOuts.length} Draw outputs and none is named view, so the page can't tell which to show` : "your root offers no Draw output, so the page has nothing to draw", fix: '<port>: { seam: "Draw<<max>>@<frame>", note: "<…>", from: (s, <inputs>) => [...] }' });
  for (const [who, part] of /** @type {const} */ ([["maze", mz], ["particles", fx]])) {
    if (part && !drawWires.some((x) => x.a.part === part.name && x.b.part === root?.name)) found.push({ file: "workbench.js", line: 1, code: "W022", message: `no wire carries the ${who} part's picture into your root`, fix: `.wire(${part.name}.out.<Draw output>, <root>.in.<Draw input>)` });
  }
  if (found.some((f) => /^(W02[012]|S)/.test(f.code)) || !viewName || !rootBuilders[viewName]) return { diagnostics: found, plan: r.plan.map(asDraw), notes };
  // the run
  const spy = catching(byName.maze.runtime);
  const runtimes = r.loaded.map((p) => (p.name === "maze" ? spy.runtime : p.runtime));
  const packages = r.loaded.map((p) => ({ name: p.name, content: p.content }));
  const run = createRun(composed, { runtimes, packages });
  const tally = new Tally();
  const view = /** @type {DrawDecl} */ (rootDecl).outs[viewName];
  const rootBox = byName[rootName].grammar.lower(root.record).seams?.extents?.[view.frame];
  /** @type {Map<any, string>} where each op in the shown list came from */
  const source = new Map();
  /** @type {Record<string, any>} each part's images, carried */
  const images = {};
  for (const p of composed.parts) Object.assign(images, imagesOf(/** @type {DrawDecl} */ (draws.get(p.dialect)), p.name));
  /** @type {Array<{ T: number, ops: any[], src: string[] }>} */
  const frames = [];
  const producerTally = new Tally();
  /** The shown list after this instant's steps. @param {number} T */
  const shownAt = (T) => {
    /** @type {Record<string, any[]>} */
    const inputs = Object.fromEntries(Object.keys(rootDecl?.ins ?? {}).map((k) => [k, []]));
    const carriedSet = new Set();
    for (const x of drawWires) {
      const pd = /** @type {DrawDecl} */ (draws.get(x.a.dialect));
      const b = builderOf(x.o.port, pd.state, x.o.max);
      const st = run.state(x.a.part);
      if (!st || b.problems.length) continue;
      const paint = { colors: pd.colors, images: pd.images };
      const got = buildAndType(b, st, {}, { name: `${x.a.part}.out.${x.a.port}`, max: x.o.max, paint, file: `${x.a.dialect}/`, line: 1, when: `at T = ${num(T)}` }, producerTally);
      const list = got.ops.filter((op) => !typeOp(op, paint).length).map((op) => convertOp(carryOp(op, paint, x.a.part), x.edge));
      for (const op of list) { source.set(op, x.a.part); carriedSet.add(op); }
      inputs[x.b.port] = list;
    }
    const st = run.state(root.name);
    if (!st) return null;
    const rootPaint = { colors: rootDecl?.colors ?? {}, images: rootDecl?.images ?? {} };
    const got = buildAndType(rootBuilders[viewName], st, inputs, { name: viewName, max: view.max, paint: rootPaint, file: rootFile, line: lineOfKey(rootText, viewName), when: `at T = ${num(T)}`, skip: carriedSet }, tally);
    const ops = got.ops.map((op) => (carriedSet.has(op) ? op : (() => { const c = carryOp(op, rootPaint, root.name); source.set(c, root.name); return c; })()));
    frames.push({ T, ops, src: ops.map((op) => source.get(op) ?? "?") });
    return ops;
  };
  const watch = (/** @type {any} */ i) => { if (i.stepped.length) shownAt(run.seconds); };
  const got = steerToCoin(run, mz.name, mz.record.grid, REACH.compose, watch);
  if ("why" in got) found.push({ file: "workbench.js", line: 1, code: "G012", message: `the checker held the D-pad toward the nearest coin, and ${got.why}`, fix: "build a maze whose control walks one cell per step the way the D-pad holds (task.md)" });
  else {
    notes.push(`run: coin at ${pt(got.cell)} picked at T = ${num(got.T)}`);
    while (run.seconds < got.T + BURST_WITHIN) { const i = run.step(); if (!i) break; watch(i); }
  }
  while (run.seconds < RUN_FOR) { const i = run.step(); if (!i) break; watch(i); }
  found.push(...tally.list());
  for (const f of producerTally.list()) notes.push(`a package's list (not yours to fix): ${f.code} ${f.message}`);
  // what the shown lists held
  const has = (/** @type {string} */ part) => frames.some((f) => f.src.includes(part));
  for (const [who, part] of /** @type {const} */ ([["maze", mz], ["particles", fx]])) {
    if (part && !has(part.name) && frames.some(() => true)) {
      const fed = drawWires.find((x) => x.a.part === part.name);
      if (fed) found.push({ file: rootFile, line: lineOfKey(rootText, viewName), code: "W022", message: `the ${who} part's picture reaches ${fed.w.to}, but no shown list holds an op of it`, fix: `spread ${"<inputs>"}.${fed.b.port} into the root's list` });
    }
  }
  if (frames.length && !frames.some((f) => f.ops.some((op) => op.op === "text"))) found.push({ file: rootFile, line: lineOfKey(rootText, viewName), code: "W023", message: "no shown list holds a text op: the HUD is missing", fix: '{ op: "text", at: [<x>, <y>], str: <…>, font: "mono", fill: "<color>" }' });
  if (!("why" in got)) {
    // the coin on the root's frame: its pickup record carried across the maze-to-particles Event wire (so through the
    // maze's own frames, whatever frame its picture is in), then across the particles' Draw wire
    const fxWire = drawWires.find((x) => x.a.part === fx.name && x.b.part === root.name);
    const evWire = composed.wires.find((/** @type {any} */ w) => ends(w.from).part === mz.name && ends(w.to).part === fx.name && w.convert.some((/** @type {any} */ c) => c.kind === "point"));
    const record = evWire ? spy.caught.get(got.T)?.[ends(evWire.from).port]?.[0] : undefined;
    const conv = evWire?.convert.find((/** @type {any} */ c) => c.kind === "point");
    const inFx = record && conv ? [/** @type {any} */ (carry(record, evWire))[conv.field]].flat() : null;
    if (!fxWire || !inFx) found.push({ file: "workbench.js", line: 1, code: "W024", message: !evWire ? "no wire carries the maze's pickup, with its position, to the particles, so no burst can be placed at the coin" : "the maze pushed no " + ends(evWire.from).port + " record when the coin at " + pt(got.cell) + " was picked at T = " + num(got.T), fix: ".wire(<maze part>.out.<Event>, <particles part>.in.<Event>), relating the frames" });
    else {
      const e = fxWire.edge;
      const coin = [inFx[0] * e.scale[0] + e.offset[0], inFx[1] * e.scale[1] + e.offset[1]];
      const radius = Math.max(1, Math.abs(conv.scale[0] * e.scale[0]));
      const after = frames.filter((f) => f.T >= got.T - 1e-9 && f.T <= got.T + BURST_WITHIN + 1e-9);
      /** @type {{ T: number, n: number, under: boolean } | null} */
      let burst = null;
      for (const f of after) {
        const center = (/** @type {any} */ op) => { const b = opBox(op, images); return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2]; };
        const near = f.ops.map((op, k) => ({ op, k })).filter(({ op, k }) => f.src[k] === fx.name && Math.hypot(center(op)[0] - coin[0], center(op)[1] - coin[1]) <= radius);
        if (!near.length) continue;
        const mazeAt = f.ops.map((op, k) => ({ op, k })).filter(({ op, k }) => f.src[k] === mz.name && inside(coin, opBox(op, images))).map(({ k }) => k);
        const under = mazeAt.some((k) => k > Math.min(...near.map((x) => x.k)));
        burst = { T: f.T, n: near.length, under };
        break;
      }
      if (!burst) found.push({ file: "workbench.js", line: 1, code: "W024", message: `the coin at ${pt(got.cell)} (at ${pt(coin)} on your root's ${view.frame}) was picked at T = ${num(got.T)}, and no shown list drew a particles op within ${num(radius)} of it by T = ${num(got.T + BURST_WITHIN)}`, fix: "wire the pickup to the burst, and relate the three frames so the burst and the maze land on the same place of your root" });
      else if (burst.under) found.push({ file: rootFile, line: lineOfKey(rootText, viewName), code: "W024", message: `at T = ${num(burst.T)} the burst is drawn near the coin, but under the maze's op there`, fix: "put the particles' list after the maze's in the root's array literal" });
      else notes.push(`run: burst of ${burst.n} particles ops drawn over the maze within ${num(radius)} of ${pt(coin)} at T = ${num(burst.T)}`);
    }
  }
  // the renderers, on the largest shown list
  const largest = frames.reduce((/** @type {{ T: number, ops: any[], src: string[] } | null} */ m, f) => (!m || f.ops.length > m.ops.length ? f : m), null);
  if (largest) {
    const by = largest.src.reduce((/** @type {Record<string, number>} */ m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {});
    const order = largest.src.filter((s, k) => k === 0 || largest.src[k - 1] !== s);
    notes.push(`shown: largest list ${largest.ops.length} of Draw<${view.max}> at T = ${num(largest.T)}: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}; painter's order ${order.join(" → ")}`);
    if (rootBox) {
      notes.push(`  canvas (${rootName}.${view.frame}, one unit a pixel): ${canvas(largest.ops, { box: rootBox, images }).text}`);
      notes.push(`  gameboy (${rootName}.${view.frame}): ${gameboy(largest.ops, { box: rootBox, images }).text}`);
    } else notes.push(`  canvas: ${rootName}.${view.frame} has no extent, so the stage has no size`);
    const atCompose = gameboyAtCompose(view.max);
    if (atCompose) notes.push(`  gameboy at composition: ${atCompose}`);
  }
  const fileOf = (/** @type {string | undefined} */ part) => { const p = partOf(String(part)); return p ? `${p.dialect}/${JSON.parse(readFileSync(join(dir, p.dialect, MANIFEST_PATH), "utf8")).entry.runtime}` : "workbench.js"; };
  for (const d of run.diagnostics) found.push({ file: fileOf(d.part), line: 1, code: d.code, message: `${d.message}${d.T !== undefined ? ` (at T = ${d.T})` : ""}`, fix: "see runtime.md, \"The rules a step keeps\"" });
  const again = replay(composed, { runtimes, packages }, JSON.parse(JSON.stringify(run.record())));
  if (again.ok) notes.push("run: replayed, same state hashes at every instant");
  else for (const d of again.diagnostics) found.push({ file: fileOf(d.part), line: 1, code: d.code, message: `replay: ${d.message}`, fix: "see runtime.md" });
  return { diagnostics: found, plan: r.plan.map(asDraw), notes };
}
