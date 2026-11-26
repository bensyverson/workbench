// One leg of the seams relay rerun (leaf WnmLua), checked on the real kit and run on kit/run. A package leg: the
// package trial's checker (kit/package's loadPackage and checkExamples, the defineUI checks), the task's ports
// (G002–G004), its runtime (G001), and each example run headless in a development run: the maze steered to a coin
// by the checker's D-pad (G006, G007), the particles sent one record by a probe part (G008), the state the checker
// reads (G005), and every N diagnostic. A compose leg: kit/compose's check and plan, the task's wire and stage
// (G010, G011), and the composition run with the D-pad steering to a coin and a burst expected near the pickup's
// converted position within half a second (G012, G013), then replayed (N005).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run as runProgram } from "../../../kit/define/index.js";
import { createRun, replay, carry } from "../../../kit/run/index.js";
import { MANIFEST_PATH } from "../../../kit/package/index.js";
import { checkPackageDir } from "../../pkg-trial/checker/index.js";
import { buildOptions } from "../../pkg-trial/checker/scope.js";
import { loadPackageDir, loadCompose } from "./load.js";
import { catching, steerToCoin, probeFor, sampleOf, startRun, PAD } from "./runs.js";

/** @typedef {import("./load.js").Found} Found */
/** @typedef {{ diagnostics: Found[], plan: string[], notes: string[] }} LegResult */

/** How many examples each starting package has (scripts/pkg-trial/fixtures/valid). */
const START_EXAMPLES = { maze: 1, particles: 6 };
/** Seconds the checker runs each example, at least. */
const RUN_FOR = 2;
/** Seconds the D-pad may take to reach a coin: an example, a composition. */
const REACH = { example: 20, compose: 30 };
/** Seconds after a pickup the burst must appear by. */
const BURST_WITHIN = 0.5;
/** The probe's record goes out at this instant, and the particles are watched until PROBE_UNTIL. */
const PROBE_AT = 0.5, PROBE_UNTIL = 1;

/** @param {number} v */
const num = (v) => String(Math.round(v * 1000) / 1000);
/** @param {unknown} p */
const pointText = (p) => (Array.isArray(p) ? `(${p.map((v) => num(v)).join(", ")})` : num(/** @type {number} */ (p)));

/**
 * What the run's state lacks that the checker reads (R3), by role.
 * @param {any} state @param {"maze" | "particles"} role
 * @returns {string[]}
 */
export function stateProblems(state, role) {
  /** @type {string[]} */
  const out = [];
  if (role === "maze") {
    if (typeof state?.player?.x !== "number" || typeof state?.player?.y !== "number") out.push("the state has no numbers player.x and player.y, which the checker's D-pad steers by");
    if (!Array.isArray(state?.grid) || !state.grid.every((/** @type {unknown} */ r) => typeof r === "string")) out.push("the state has no grid of row strings, which the checker reads coins from");
  } else if (!Array.isArray(state?.particles)) out.push("the state has no particles list, which the checker counts");
  else if (!state.particles.every((/** @type {any} */ p) => typeof p?.x === "number" && typeof p?.y === "number")) out.push("a particle in the state has no numbers x and y, which the checker reads positions from");
  return out;
}

/**
 * The ports the author's task asks for that the Dialect lacks.
 * @param {any} dialect @param {"maze" | "particles"} role @param {{ grammar: string, examples: string[] }} text
 * @returns {string[]}
 */
export function portProblems(dialect, role, text) {
  const outs = Object.values(/** @type {Record<string, any>} */ (dialect.seams.out ?? {}));
  const ins = Object.values(/** @type {Record<string, any>} */ (dialect.seams.in ?? {}));
  /** @type {string[]} */
  const out = [];
  if (role === "maze") {
    if (!outs.some((p) => p.seam.kind === "event")) out.push("the task asks for at least one Event output (ports.out)");
    return out;
  }
  if (!ins.some((p) => p.seam.kind === "event")) out.push("the task asks for at least one Event input that makes particles appear (ports.in)");
  if (!ins.some((p) => p.seam.kind !== "event")) out.push("the task asks for at least one value input that a lambda reads (ports.in, inputs)");
  else {
    const name = dialect.seams.inputs?.name;
    if (!name || !text.examples.some((t) => new RegExp(`\\b${name}\\.\\w`).test(t))) out.push(`no example's lambda reads a value input (${name ?? "the inputs object"}.<input>): the task asks for one a lambda reads`);
  }
  if (!/ref\(\s*["']in["']/.test(text.grammar)) out.push('the Grammar names no input (ref("in")): the task asks that a Program can say which emitters an input drives');
  return out;
}

/**
 * Checks one leg.
 * @param {string} dir  a package folder (maze, particles), or the compose leg's folder
 * @param {"maze" | "particles" | "compose"} role
 * @returns {Promise<LegResult>}
 */
export async function checkLeg(dir, role) {
  return role === "compose" ? checkComposeLeg(dir) : checkPackageLeg(dir, role);
}

/**
 * A run's N diagnostics as findings at `file`. @param {any[]} diagnostics @param {(part?: string) => string} fileOf @param {string} [what]
 * @returns {Found[]}
 */
const runFindings = (diagnostics, fileOf, what = "") => diagnostics.map((d) => ({ file: fileOf(d.part), line: 1, code: d.code, message: `${what}${d.message}${d.T !== undefined ? ` (at T = ${d.T})` : ""}`, fix: "see runtime.md, \"The rules a step keeps\"" }));

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

/**
 * @param {string} dir @param {"maze" | "particles"} role
 * @returns {Promise<LegResult>}
 */
async function checkPackageLeg(dir, role) {
  /** @type {string[]} */
  const notes = [];
  const pkg = await checkPackageDir(dir);
  /** @type {Found[]} */
  const found = pkg.diagnostics.map((d) => ({ file: d.file, line: d.line, code: d.code, message: d.message, fix: d.fix }));
  if (found.length) return { diagnostics: found, plan: [], notes };
  const { loaded, importModule } = await loadPackageDir(dir);
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), "utf8"));
  const at = (/** @type {string} */ file) => (/** @type {string} */ code, /** @type {string} */ message, /** @type {string} */ fix) => found.push({ file, line: 1, code, message, fix });
  const [major, minor] = String(manifest.version).split(".").map(Number);
  if (!(major > 0 || minor > 1)) at(MANIFEST_PATH)("G002", `version ${manifest.version}: the package adds to its language, so its minor version is raised`, '"version": "0.2.0"');
  if (loaded.examples.length <= START_EXAMPLES[role]) at(MANIFEST_PATH)("G003", `${loaded.examples.length} example${loaded.examples.length === 1 ? "" : "s"}, as at the start: add one that uses what you added, and list it in "examples"`, '"examples": [..., "examples/0N.js"]');
  const text = { grammar: readFileSync(join(dir, manifest.entry.grammar), "utf8"), examples: loaded.examples.map((/** @type {string} */ p) => readFileSync(join(dir, p), "utf8")) };
  for (const m of portProblems(loaded.dialect, role, text)) at(manifest.entry.dialect)("G004", m, "see seams.md, \"Ports, for a language's author\"");
  if (!loaded.runtime) {
    at(MANIFEST_PATH)("G001", "the package has no runtime, so it cannot run: add a runtime module and name it in entry.runtime", '"entry": { ..., "runtime": "' + role + '.runtime.js" }');
    return { diagnostics: found, plan: [], notes };
  }
  const runtimeFile = manifest.entry.runtime;
  const pkgInfo = [{ name: loaded.name, content: loaded.content, version: loaded.version }];
  if (role === "maze") await runMazeExamples(loaded, importModule, pkgInfo, runtimeFile, found, notes);
  else await runParticlesExamples(loaded, importModule, pkgInfo, runtimeFile, found, notes);
  return { diagnostics: found, plan: [], notes };
}

/**
 * Each maze example run alone with the checker's D-pad steering the player to a coin.
 * @param {any} loaded @param {(path: string) => Promise<any>} importModule @param {any[]} packages @param {string} runtimeFile @param {Found[]} found @param {string[]} notes
 */
async function runMazeExamples(loaded, importModule, packages, runtimeFile, found, notes) {
  for (const path of loaded.examples) {
    const ex = await exampleOf(importModule, path);
    const spy = catching(loaded.runtime);
    const s = startRun({ builders: [ex.builder], show: ex.builder, runtimes: [spy.runtime], build: ex.build, packages });
    if (!s.run) { for (const d of s.problems) found.push({ file: path, line: 1, code: d.code, message: d.message, fix: d.fix ?? "" }); continue; }
    const part = s.composed.parts[0].name;
    const grid = s.composed.parts[0].record.grid;
    const r = steerToCoin(s.run, part, grid, REACH.example);
    if ("why" in r) {
      if (r.why === "its grid has no coin") notes.push(`${path}: no coin, so no D-pad run`);
      else found.push({ file: path, line: 1, code: "G006", message: `the checker held the D-pad (controls.${PAD}) toward the nearest coin, and ${r.why}`, fix: "read controls.pad (runtime.md, \"Controls\") and walk the player the way the control lambda says; keep state.player.x and .y" });
    } else {
      const pushed = Object.entries(spy.caught.get(r.T) ?? {}).filter(([, v]) => v.length);
      if (pushed.length) notes.push(`${path}: coin at ${pointText(r.cell)} picked at T = ${num(r.T)}; ${pushed.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("; ")}`);
      else found.push({ file: runtimeFile, line: 1, code: "G007", message: `${path}: the player reached the coin at ${pointText(r.cell)} at T = ${num(r.T)}, and the step pushed no Event record`, fix: "push a record into ctx.events.<port> in the step that picks the coin up (runtime.md)" });
    }
    if (s.run.seconds < RUN_FOR) s.run.runUntil(RUN_FOR);
    const st = s.run.state(part);
    if (st) for (const m of stateProblems(st, "maze")) found.push({ file: runtimeFile, line: 1, code: "G005", message: `${path}: ${m}`, fix: "keep player: { x, y } and grid in the state (rules.md, R3)" });
    found.push(...runFindings(s.run.diagnostics, () => runtimeFile, `${path}: `));
  }
}

/** Each particle within `r` of `p` in a particles state. @param {any} state @param {number[]} p @param {number} r */
const near = (state, p, r) => (state?.particles ?? []).filter((/** @type {any} */ q) => Math.hypot(q.x - p[0], q.y - (p[1] ?? 0)) <= r).length;

/**
 * Each particles example run alone, and with a probe part that sends one record to each Event input.
 * @param {any} loaded @param {(path: string) => Promise<any>} importModule @param {any[]} packages @param {string} runtimeFile @param {Found[]} found @param {string[]} notes
 */
async function runParticlesExamples(loaded, importModule, packages, runtimeFile, found, notes) {
  const dialect = loaded.dialect;
  const events = Object.values(/** @type {Record<string, any>} */ (dialect.seams.in)).filter((p) => p.seam.kind === "event");
  let burst = false;
  for (const path of loaded.examples) {
    const ex = await exampleOf(importModule, path);
    const alone = startRun({ builders: [ex.builder], show: ex.builder, runtimes: [loaded.runtime], build: ex.build, packages });
    if (!alone.run) { for (const d of alone.problems) found.push({ file: path, line: 1, code: d.code, message: d.message, fix: d.fix ?? "" }); continue; }
    const part = alone.composed.parts[0].name;
    /** @type {Map<string, any>} */
    const without = new Map();
    while (alone.run.seconds < RUN_FOR) { const i = alone.run.step(); if (!i) break; if (i.stepped.includes(part)) without.set(i.T, alone.run.state(part)); }
    const st = alone.run.state(part);
    if (st) for (const m of stateProblems(st, "particles")) found.push({ file: runtimeFile, line: 1, code: "G005", message: `${path}: ${m}`, fix: "keep each particle's x and y in state.particles (rules.md, R3)" });
    found.push(...runFindings(alone.run.diagnostics, () => runtimeFile, `${path}: `));
    if (alone.run.diagnostics.length) continue;
    const extents = loaded.grammar.lower(alone.composed.parts[0].record).seams?.extents ?? {};
    for (const input of events) {
      /** @type {number[]} */
      let point = [];
      let radius = 16;
      const record = sampleOf(input.seam, (frame, dims) => {
        const box = extents[frame];
        point = box ? box.min.map((/** @type {number} */ m, /** @type {number} */ k) => (m + box.max[k]) / 2) : new Array(dims).fill(1);
        if (box) radius = Math.max(1, 0.1 * Math.hypot(...box.max.map((/** @type {number} */ m, /** @type {number} */ k) => m - box.min[k])));
        return point;
      });
      if (!point.length) continue;
      const probe = probeFor(dialect, input.name, record, PROBE_AT);
      const frames = Object.keys(dialect.seams.frames).map((f) => /** @type {[any, any]} */ ([probe.builder.frame[f], ex.builder.frame[f]]));
      const withProbe = startRun({ builders: [probe.builder, ex.builder], frames, wires: [[probe.builder.out.fire, ex.builder.in[input.name]]], show: ex.builder, runtimes: [probe.runtime, loaded.runtime], build: ex.build, packages });
      if (!withProbe.run) continue;
      /** @type {{ T: string, n: number } | null} */
      let hit = null;
      while (withProbe.run.seconds < PROBE_UNTIL && !hit) {
        const i = withProbe.run.step();
        if (!i) break;
        if (!i.stepped.includes(part) || withProbe.run.seconds < PROBE_AT - 1e-9) continue;
        const n = near(withProbe.run.state(part), point, radius), base = near(without.get(i.T), point, radius);
        if (n > base) hit = { T: num(withProbe.run.seconds), n: n - base };
      }
      found.push(...runFindings(withProbe.run.diagnostics, () => runtimeFile, `${path}, with a probe record on ${input.name}: `));
      if (hit) { burst = true; notes.push(`${path}: a ${input.name} record at ${pointText(point)} at T = ${num(PROBE_AT)}: ${hit.n} particles within ${num(radius)} of it at T = ${hit.T}`); }
    }
  }
  if (!burst && events.length) found.push({ file: runtimeFile, line: 1, code: "G008", message: `the checker sent one record to ${events.map((e) => e.name).join(", ")} at T = ${PROBE_AT}, at the middle of its frame's extent, in each example, and no particles appeared near it by T = ${PROBE_UNTIL}`, fix: "spawn particles at the record's position when a record arrives on an emitter's trigger input (ctx.inputs.<input>), in at least one example" });
}

/**
 * The compose leg.
 * @param {string} dir
 * @returns {Promise<LegResult>}
 */
async function checkComposeLeg(dir) {
  /** @type {string[]} */
  const notes = [];
  const r = await loadCompose(dir, ["maze", "particles"]);
  if (r.diagnostics.length) return { diagnostics: r.diagnostics, plan: [], notes };
  /** @type {Found[]} */
  const found = [];
  const byName = Object.fromEntries(r.loaded.map((p) => [p.name, p]));
  const runtimes = r.loaded.map((p) => p.runtime);
  if (runtimes.some((x) => !x)) return { diagnostics: [{ file: "workbench.js", line: 1, code: "G001", message: "a package has no runtime, so the workbench cannot run", fix: "the packages are not yours to change: report it" }], plan: r.plan, notes };
  const composed = r.composition.build({ ...r.options, runtimes });
  const parts = (/** @type {string} */ d) => composed.parts.filter((/** @type {any} */ p) => p.dialect === d);
  const [mz] = parts("maze"), [fx] = parts("particles");
  const ends = (/** @type {string} */ s) => { const [part, , port] = s.split("."); return { part, port }; };
  const wire = composed.wires.find((/** @type {any} */ w) => ends(w.from).part === mz?.name && ends(w.to).part === fx?.name
    && byName.maze.dialect.seams.out[ends(w.from).port]?.seam.kind === "event" && byName.particles.dialect.seams.in[ends(w.to).port]?.seam.kind === "event");
  if (!wire) found.push({ file: "workbench.js", line: 1, code: "G010", message: "no wire from a maze part's Event output into a particles part's Event input: the burst is not wired to the pickup", fix: ".wire(<maze part>.out.<event>, <particles part>.in.<event>)" });
  if (composed.show !== fx?.name) found.push({ file: "workbench.js", line: 1, code: "G011", message: `the page shows '${composed.show}', not the particles part`, fix: `.show(<particles part>)` });
  if (found.length) return { diagnostics: found, plan: r.plan, notes };
  const fileOf = (/** @type {string | undefined} */ part) => { const p = composed.parts.find((/** @type {any} */ x) => x.name === part); return p ? `${p.dialect}/${JSON.parse(readFileSync(join(dir, p.dialect, MANIFEST_PATH), "utf8")).entry.runtime}` : "workbench.js"; };
  const spy = catching(byName.maze.runtime);
  const running = [spy.runtime, byName.particles.runtime];
  const packages = r.loaded.map((p) => ({ name: p.name, content: p.content }));
  const run = createRun(composed, { runtimes: running, packages });
  /** @type {Array<{ T: number, state: any }>} */
  const fxStates = [];
  const watch = (/** @type {any} */ i) => { if (i.stepped.includes(fx.name)) { fxStates.push({ T: run.seconds, state: run.state(fx.name) }); if (fxStates.length > 4) fxStates.shift(); } };
  const got = steerToCoin(run, mz.name, mz.record.grid, REACH.compose, watch);
  if ("why" in got) {
    found.push({ file: "workbench.js", line: 1, code: "G012", message: `the checker held the D-pad toward the nearest coin, and ${got.why}`, fix: "build a maze whose control walks one cell per step the way the D-pad holds (task.md)" });
    found.push(...runFindings(run.diagnostics, fileOf));
    return { diagnostics: found, plan: r.plan, notes };
  }
  notes.push(`run: coin at ${pointText(got.cell)} picked at T = ${num(got.T)}`);
  const records = spy.caught.get(got.T)?.[ends(wire.from).port] ?? [];
  const seam = byName.particles.dialect.seams.in[ends(wire.to).port].seam.of;
  const field = Object.entries(seam.kind === "record" ? seam.fields : {}).find(([, f]) => /** @type {any} */ (f).kind === "point")?.[0];
  if (!records.length || field === undefined) {
    found.push({ file: "workbench.js", line: 1, code: "G013", message: !records.length ? `the maze pushed no ${ends(wire.from).port} record when the coin was picked up at T = ${num(got.T)}` : `${wire.to}'s records have no point field, so the burst has no position`, fix: "the packages are not yours to change: report it" });
    return { diagnostics: [...found, ...runFindings(run.diagnostics, fileOf)], plan: r.plan, notes };
  }
  const carried = /** @type {any} */ (carry(records[0], wire));
  const expected = [carried[field]].flat();
  const conv = wire.convert.find((/** @type {any} */ c) => c.field === field);
  const radius = Math.max(1, Math.abs(conv?.scale?.[0] ?? 1));
  const before = [...fxStates].reverse().find((s) => s.T < got.T - 1e-9);
  const base = near(before?.state, expected, radius);
  /** @type {{ T: number, n: number } | null} */
  let burst = null;
  for (const s of fxStates) if (s.T >= got.T - 1e-9 && near(s.state, expected, radius) > base) { burst = { T: s.T, n: near(s.state, expected, radius) - base }; break; }
  while (!burst && run.seconds < got.T + BURST_WITHIN) {
    const i = run.step();
    if (!i) break;
    if (i.stepped.includes(fx.name)) { const n = near(run.state(fx.name), expected, radius); if (n > base) burst = { T: run.seconds, n: n - base }; }
  }
  const where = `${radius === 1 ? "1" : num(radius)} of ${pointText(expected)} in ${conv?.to ?? "the particles' frame"}`;
  const box = conv ? byName.particles.grammar.lower(fx.record).seams?.extents?.[conv.to.split(".").slice(1).join(".")] : undefined;
  const off = box && expected.some((v, k) => v < box.min[k] || v > box.max[k]);
  if (off) found.push({ file: "workbench.js", line: 1, code: "G013", message: `the coin at ${pointText(got.cell)} reached ${wire.to} at ${pointText(expected)}, outside the particles' box ${pointText(box.min)} to ${pointText(box.max)}, so the burst is not where the stage shows the coin`, fix: "relate the frames so the maze's cells land inside the particles' box (\"fit\", or an edge that maps them there)" });
  else if (burst) notes.push(`run: burst of ${burst.n} particles within ${where} at T = ${num(burst.T)}`);
  else found.push({ file: "workbench.js", line: 1, code: "G013", message: `the coin at ${pointText(got.cell)} was picked up at T = ${num(got.T)}; its record reached ${wire.to} as ${JSON.stringify(carried)}, and no particles appeared within ${where} by T = ${num(got.T + BURST_WITHIN)}`, fix: "relate the frames so the coin's cell lands where the particles' box shows it, and give the burst emitter a trigger and a spawn that places particles at the record" });
  run.runUntil(Math.max(run.seconds, got.T + 1));
  found.push(...runFindings(run.diagnostics, fileOf));
  const again = replay(composed, { runtimes: running, packages }, JSON.parse(JSON.stringify(run.record())));
  if (again.ok) notes.push("run: replayed, same state hashes at every instant");
  else found.push(...runFindings(again.diagnostics, fileOf, "replay: "));
  return { diagnostics: found, plan: r.plan, notes };
}
