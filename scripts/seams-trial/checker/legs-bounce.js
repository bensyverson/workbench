// The second pairing's legs (leaf UTdvE6): bounce, balls that meet the walls of a box, into swarm, agents a record
// draws. Both languages' Programs declare data of their own (a ball's .prop, an agent's .trait), which must last
// in the run's state. A bounce leg: each example run headless, and an Event output must push a record when a ball
// meets a wall, with a point at a wall of its frame's extent (G014, G015). A swarm leg: each example run with and
// without one probe record on each Event input, and agents must gather near it (G016); every agent carries each
// trait its Program declares (G017). A compose leg: the wire and stage (G020, G021), then the composition run
// beside the same composition with the bounce part's Events swallowed: records pushed (G022), and agents gathered
// near a converted record within two seconds of it (G023), then a replay (N005).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRun, replay, carry } from "../../../kit/run/index.js";
import { MANIFEST_PATH } from "../../../kit/package/index.js";
import { loadCompose } from "./load.js";
import { catching, silencing, probeFor, sampleOf, startRun } from "./runs.js";
import { num, pointText, runFindings, runWarnings, exampleOf } from "./common.js";

/** @typedef {import("./load.js").Found} Found */
/** @typedef {import("./common.js").LegResult} LegResult */

/** Seconds the checker runs each bounce example. */
const RUN_FOR = 4;
/** The swarm probe's record goes out at this instant, and the agents are watched until GATHER_UNTIL. */
const PROBE_AT = 0.5, GATHER_UNTIL = 2.5;
/** Seconds the composition runs, and how long after each record the agents may take to gather. */
const COMPOSE_FOR = 8, GATHER_WITHIN = 2;
/** "Near" is this share of the extent's diagonal; "at a wall" this share of the extent on one axis. */
const NEAR = 0.1, WALL = 0.1;

/** @param {{ min: number[], max: number[] }} box */
const radiusOf = (box) => Math.max(1, NEAR * Math.hypot(...box.max.map((m, k) => m - box.min[k])));

/**
 * What the run's state lacks that the checker reads (R3).
 * @param {any} state @param {"bounce" | "swarm"} role
 * @returns {string[]}
 */
export function stateProblems2(state, role) {
  const key = role === "bounce" ? "balls" : "agents";
  const what = role === "bounce" ? "ball" : "agent";
  if (!Array.isArray(state?.[key])) return [`the state has no ${key} list, which the checker reads`];
  if (!state[key].every((/** @type {any} */ p) => typeof p?.x === "number" && typeof p?.y === "number")) return [`a ${what} in state.${key} has no numbers x and y, which the checker reads positions from`];
  return [];
}

/** Whether an agent carries `name` as a number, on itself or in one struct of its own. @param {any} a @param {string} name */
const carries = (a, name) => typeof a?.[name] === "number" || Object.values(a ?? {}).some((v) => v !== null && typeof v === "object" && !Array.isArray(v) && typeof v[name] === "number");

/**
 * The traits a Program declares that an agent in the state does not carry (G017).
 * @param {any} state @param {string[]} names
 * @returns {string[]}
 */
export function traitProblems(state, names) {
  const agents = Array.isArray(state?.agents) ? state.agents : [];
  return names.flatMap((n) => {
    const i = agents.findIndex((/** @type {any} */ a) => !carries(a, n));
    return i < 0 ? [] : [`agent ${i} in state.agents does not carry the trait '${n}' as a number (on the agent, or in one struct of the agent's), so what a lambda leaves in it does not last to the next step`];
  });
}

/**
 * Whether `p` is at a wall of `box`: inside it, give or take a tenth of each axis, and within a tenth of one axis of
 * one side.
 * @param {number[]} p @param {{ min: number[], max: number[] }} box
 */
export function atWall(p, box) {
  const tol = box.min.map((m, k) => WALL * (box.max[k] - m));
  if (p.some((v, k) => v < box.min[k] - tol[k] || v > box.max[k] + tol[k])) return false;
  return p.some((v, k) => Math.abs(v - box.min[k]) <= tol[k] || Math.abs(v - box.max[k]) <= tol[k]);
}

/** Agents within `r` of `p`. @param {any} state @param {number[]} p @param {number} r */
const near = (state, p, r) => (state?.agents ?? []).filter((/** @type {any} */ a) => Math.hypot(a.x - p[0], a.y - (p[1] ?? 0)) <= r).length;

/**
 * How many more agents are within `r` of `p` in `state` than in `baseline`, the same run at the same instant
 * without the record.
 * @param {any} state @param {any} baseline @param {number[]} p @param {number} r
 */
export const gathered = (state, baseline, p, r) => near(state, p, r) - near(baseline, p, r);

/** The first point field of an Event seam's record, with its frame. @param {any} seam @returns {{ field: string, frame: string } | undefined} */
function pointField(seam) {
  const rec = seam?.kind === "event" ? seam.of : seam;
  const hit = Object.entries(rec?.kind === "record" ? rec.fields : {}).find(([, f]) => /** @type {any} */ (f).kind === "point");
  return hit ? { field: hit[0], frame: /** @type {any} */ (hit[1]).frame } : undefined;
}

/** @param {any} dialect @param {"in" | "out"} side */
const eventPorts = (dialect, side) => Object.values(/** @type {Record<string, any>} */ (dialect.seams[side] ?? {})).filter((p) => p.seam.kind === "event");

/**
 * The ports the author's task asks for that the Dialect lacks (G004).
 * @param {any} dialect @param {"bounce" | "swarm"} role
 * @returns {string[]}
 */
export function portProblems2(dialect, role) {
  if (role === "bounce") {
    const outs = eventPorts(dialect, "out");
    if (!outs.length) return ["the task asks for at least one Event output that pushes a record each time a ball meets a wall (ports.out)"];
    if (!outs.some((p) => pointField(p.seam))) return ["the task asks that an Event output's record says where the ball met the wall: give it a point field"];
    return [];
  }
  const ins = eventPorts(dialect, "in");
  if (!ins.length) return ["the task asks for at least one Event input that draws agents toward the position in its record (ports.in)"];
  if (!ins.some((p) => pointField(p.seam))) return ["the task asks for an Event input whose record holds a position: give it a point field"];
  return [];
}

/**
 * Each bounce example run alone for RUN_FOR seconds, catching what its Event outputs push.
 * @param {any} loaded @param {(path: string) => Promise<any>} importModule @param {any[]} packages @param {string} runtimeFile @param {Found[]} found @param {string[]} notes
 */
export async function runBounceExamples(loaded, importModule, packages, runtimeFile, found, notes) {
  const outs = eventPorts(loaded.dialect, "out");
  let pushed = false;
  /** @type {Found | null} */
  let misplaced = null;
  for (const path of loaded.examples) {
    const ex = await exampleOf(importModule, path);
    const spy = catching(loaded.runtime);
    const s = startRun({ builders: [ex.builder], show: ex.builder, runtimes: [spy.runtime], build: ex.build, packages });
    if (!s.run) { for (const d of s.problems) found.push({ file: path, line: 1, code: d.code, message: d.message, fix: d.fix ?? "" }); continue; }
    const part = s.composed.parts[0].name;
    s.run.runUntil(RUN_FOR);
    const st = s.run.state(part);
    if (st) for (const m of stateProblems2(st, "bounce")) found.push({ file: runtimeFile, line: 1, code: "G005", message: `${path}: ${m}`, fix: "keep each ball's x and y in state.balls (rules.md, R3)" });
    found.push(...runFindings(s.run.diagnostics, () => runtimeFile, `${path}: `));
    notes.push(...runWarnings(s.run.diagnostics, () => runtimeFile, `${path}: `));
    const extents = loaded.grammar.lower(s.composed.parts[0].record).seams?.extents ?? {};
    const records = [...spy.caught.entries()].sort(([a], [b]) => a - b)
      .flatMap(([T, byPort]) => outs.flatMap((o) => (byPort[o.name] ?? []).map((r) => ({ T, port: o, r: /** @type {any} */ (r) }))));
    if (!records.length) continue;
    pushed = true;
    const names = [...new Set(records.map((x) => x.port.name))].join(", ");
    notes.push(`${path}: ${records.length} ${names} records in ${RUN_FOR} s; the first at T = ${num(records[0].T)}: ${JSON.stringify(records[0].r)}`);
    for (const { T, port, r } of records) {
      if (misplaced) break;
      const pf = pointField(port.seam);
      if (!pf) continue;
      const box = extents[pf.frame];
      const p = [r[pf.field]].flat();
      if (box && !atWall(p, box)) misplaced = { file: runtimeFile, line: 1, code: "G015", message: `${path}: the ${port.name} record pushed at T = ${num(T)} has ${pf.field} ${pointText(p)}, which is not at a wall of ${pf.frame}'s extent ${pointText(box.min)} to ${pointText(box.max)}`, fix: "push the point where the ball met the wall, in the frame the port declares (rules.md, \"At a wall\")" };
    }
  }
  if (!pushed && outs.length) found.push({ file: runtimeFile, line: 1, code: "G014", message: `the checker ran each example for ${RUN_FOR} s and no Event output (${outs.map((o) => o.name).join(", ")}) pushed a record, though balls met walls`, fix: "push a record into ctx.events.<port> in the step a ball meets a wall (runtime.md)" });
  if (misplaced) found.push(misplaced);
}

/**
 * Each swarm example run alone, and with a probe part that sends one record to each Event input.
 * @param {any} loaded @param {(path: string) => Promise<any>} importModule @param {any[]} packages @param {string} runtimeFile @param {Found[]} found @param {string[]} notes
 */
export async function runSwarmExamples(loaded, importModule, packages, runtimeFile, found, notes) {
  const dialect = loaded.dialect;
  const events = eventPorts(dialect, "in");
  let drew = false;
  for (const path of loaded.examples) {
    const ex = await exampleOf(importModule, path);
    const alone = startRun({ builders: [ex.builder], show: ex.builder, runtimes: [loaded.runtime], build: ex.build, packages });
    if (!alone.run) { for (const d of alone.problems) found.push({ file: path, line: 1, code: d.code, message: d.message, fix: d.fix ?? "" }); continue; }
    const part = alone.composed.parts[0].name;
    /** @type {Map<string, any>} */
    const without = new Map();
    while (alone.run.seconds < GATHER_UNTIL) { const i = alone.run.step(); if (!i) break; if (i.stepped.includes(part)) without.set(i.T, alone.run.state(part)); }
    const st = alone.run.state(part);
    if (st) for (const m of stateProblems2(st, "swarm")) found.push({ file: runtimeFile, line: 1, code: "G005", message: `${path}: ${m}`, fix: "keep each agent's x and y in state.agents (rules.md, R3)" });
    const traits = Object.keys(alone.composed.parts[0].record.traits ?? {});
    if (st && traits.length) for (const m of traitProblems(st, traits)) found.push({ file: runtimeFile, line: 1, code: "G017", message: `${path}: ${m}`, fix: "keep each trait the Program declares on every agent in the state (rules.md, R3; runtime.md, \"A Program's own data, in the state\")" });
    found.push(...runFindings(alone.run.diagnostics, () => runtimeFile, `${path}: `));
    notes.push(...runWarnings(alone.run.diagnostics, () => runtimeFile, `${path}: `));
    if (alone.run.diagnostics.some((/** @type {any} */ d) => d.severity !== "warning")) continue;
    const extents = loaded.grammar.lower(alone.composed.parts[0].record).seams?.extents ?? {};
    for (const input of events) {
      /** @type {number[]} */
      let point = [];
      let radius = 16;
      const record = sampleOf(input.seam, (frame, dims) => {
        const box = extents[frame];
        point = box ? box.min.map((/** @type {number} */ m, /** @type {number} */ k) => (m + box.max[k]) / 2) : new Array(dims).fill(1);
        if (box) radius = radiusOf(box);
        return point;
      });
      if (!point.length) continue;
      const probe = probeFor(dialect, input.name, record, PROBE_AT);
      const frames = Object.keys(dialect.seams.frames).map((f) => /** @type {[any, any]} */ ([probe.builder.frame[f], ex.builder.frame[f]]));
      const withProbe = startRun({ builders: [probe.builder, ex.builder], frames, wires: [[probe.builder.out.fire, ex.builder.in[input.name]]], show: ex.builder, runtimes: [probe.runtime, loaded.runtime], build: ex.build, packages });
      if (!withProbe.run) continue;
      /** @type {{ T: string, n: number } | null} */
      let hit = null;
      while (withProbe.run.seconds < GATHER_UNTIL && !hit) {
        const i = withProbe.run.step();
        if (!i) break;
        if (!i.stepped.includes(part) || withProbe.run.seconds < PROBE_AT - 1e-9 || !without.has(i.T)) continue;
        const n = gathered(withProbe.run.state(part), without.get(i.T), point, radius);
        if (n > 0) hit = { T: num(withProbe.run.seconds), n };
      }
      found.push(...runFindings(withProbe.run.diagnostics, () => runtimeFile, `${path}, with a probe record on ${input.name}: `));
      notes.push(...runWarnings(withProbe.run.diagnostics, () => runtimeFile, `${path}, with a probe record on ${input.name}: `));
      if (hit) { drew = true; notes.push(`${path}: a ${input.name} record at ${pointText(point)} at T = ${num(PROBE_AT)}: ${hit.n} more agents within ${num(radius)} of it than without, at T = ${hit.T}`); }
    }
  }
  if (!drew && events.length) found.push({ file: runtimeFile, line: 1, code: "G016", message: `the checker sent one record to ${events.map((e) => e.name).join(", ")} at T = ${PROBE_AT}, at the middle of its frame's extent, in each example, and no more agents were near it than without the record by T = ${GATHER_UNTIL}`, fix: "draw agents toward the record's position when a record arrives on the Event input (ctx.inputs.<input>), in at least one example" });
}

/**
 * The compose leg of the second pairing.
 * @param {string} dir
 * @returns {Promise<LegResult>}
 */
export async function checkBounceCompose(dir) {
  /** @type {string[]} */
  const notes = [];
  const r = await loadCompose(dir, ["bounce", "swarm"]);
  if (r.diagnostics.length) return { diagnostics: r.diagnostics, plan: [], notes };
  notes.push(...r.warnings);
  /** @type {Found[]} */
  const found = [];
  const byName = Object.fromEntries(r.loaded.map((p) => [p.name, p]));
  const runtimes = r.loaded.map((p) => p.runtime);
  if (runtimes.some((x) => !x)) return { diagnostics: [{ file: "workbench.js", line: 1, code: "G001", message: "a package has no runtime, so the workbench cannot run", fix: "the packages are not yours to change: report it" }], plan: r.plan, notes };
  const composed = r.composition.build({ ...r.options, runtimes });
  const parts = (/** @type {string} */ d) => composed.parts.filter((/** @type {any} */ p) => p.dialect === d);
  const [bx] = parts("bounce"), [sw] = parts("swarm");
  const ends = (/** @type {string} */ s) => { const [part, , port] = s.split("."); return { part, port }; };
  const wire = composed.wires.find((/** @type {any} */ w) => ends(w.from).part === bx?.name && ends(w.to).part === sw?.name
    && byName.bounce.dialect.seams.out[ends(w.from).port]?.seam.kind === "event" && byName.swarm.dialect.seams.in[ends(w.to).port]?.seam.kind === "event");
  if (!wire) found.push({ file: "workbench.js", line: 1, code: "G020", message: "no wire from a bounce part's Event output into a swarm part's Event input: the agents never hear of a ball meeting a wall", fix: ".wire(<bounce part>.out.<event>, <swarm part>.in.<event>)" });
  if (composed.show !== sw?.name) found.push({ file: "workbench.js", line: 1, code: "G021", message: `the page shows '${composed.show}', not the swarm part`, fix: ".show(<swarm part>)" });
  if (found.length) return { diagnostics: found, plan: r.plan, notes };
  const fileOf = (/** @type {string | undefined} */ part) => { const p = composed.parts.find((/** @type {any} */ x) => x.name === part); return p ? `${p.dialect}/${JSON.parse(readFileSync(join(dir, p.dialect, MANIFEST_PATH), "utf8")).entry.runtime}` : "workbench.js"; };
  const spy = catching(byName.bounce.runtime);
  const running = [spy.runtime, byName.swarm.runtime];
  const packages = r.loaded.map((p) => ({ name: p.name, content: p.content }));
  const run = createRun(composed, { runtimes: running, packages });
  // the same composition with the bounce part's Events swallowed: what the agents do when no record ever arrives
  const quiet = createRun(composed, { runtimes: [silencing(byName.bounce.runtime), byName.swarm.runtime], packages });
  const port = ends(wire.from).port;
  const pf = pointField(byName.swarm.dialect.seams.in[ends(wire.to).port].seam);
  if (!pf) return { diagnostics: [{ file: "workbench.js", line: 1, code: "G023", message: `${wire.to}'s records have no point field, so the agents have nowhere to gather`, fix: "the packages are not yours to change: report it" }], plan: r.plan, notes };
  const conv = wire.convert.find((/** @type {any} */ c) => c.field === pf.field);
  const frame = conv ? conv.to.split(".").slice(1).join(".") : pf.frame;
  const where = conv?.to ?? `swarm.${frame}`;
  const box = byName.swarm.grammar.lower(sw.record).seams?.extents?.[frame];
  const radius = box ? radiusOf(box) : 16;
  const outside = (/** @type {number[]} */ p) => !!box && p.some((v, k) => v < box.min[k] || v > box.max[k]);
  /** @type {Array<{ T: number, p: number[] }>} */
  const records = [];
  /** @type {{ n: number, T: number, rec: { T: number, p: number[] } } | null} */
  let hit = null;
  while (run.seconds < COMPOSE_FOR) {
    const i = run.step();
    if (!i) break;
    quiet.step();
    if (i.stepped.includes(bx.name)) for (const rec of spy.caught.get(run.seconds)?.[port] ?? []) records.push({ T: run.seconds, p: [/** @type {any} */ (carry(rec, wire))[pf.field]].flat() });
    if (hit || !i.stepped.includes(sw.name)) continue;
    for (const rec of records) {
      if (run.seconds - rec.T > GATHER_WITHIN || run.seconds < rec.T - 1e-9) continue;
      const n = gathered(run.state(sw.name), quiet.state(sw.name), rec.p, radius);
      if (n > 0) { hit = { n, T: run.seconds, rec }; break; }
    }
  }
  if (!records.length) found.push({ file: "workbench.js", line: 1, code: "G022", message: `the bounce part pushed no ${port} record in ${COMPOSE_FOR} s, so the agents had nothing to answer`, fix: "build a box whose balls move and meet its walls within a few seconds (task.md)" });
  else {
    notes.push(`run: ${records.length} ${port} records by T = ${COMPOSE_FOR}; the first at T = ${num(records[0].T)}, reaching ${wire.to} at ${pointText(records[0].p)}`);
    if (hit) notes.push(`run: ${hit.n} more agents within ${num(radius)} of ${pointText(hit.rec.p)} in ${where} than without, at T = ${num(hit.T)}, ${num(hit.T - hit.rec.T)} s after its record`);
    else if (records.every((x) => outside(x.p))) found.push({ file: "workbench.js", line: 1, code: "G023", message: `every ${port} record reached ${wire.to} outside the swarm's extent ${pointText(box.min)} to ${pointText(box.max)} (the first at ${pointText(records[0].p)}), so the agents cannot gather where the balls meet the walls`, fix: "relate the frames so the box lands on the swarm's ground (\"fit\", or an edge that maps it there)" });
    else found.push({ file: "workbench.js", line: 1, code: "G023", message: `${records.length} ${port} records reached ${wire.to} (the first at ${pointText(records[0].p)} at T = ${num(records[0].T)}), and in no swarm step within ${GATHER_WITHIN} s of one were more agents within ${num(radius)} of it than without the records`, fix: "relate the frames so the box lands where the swarm's ground shows it, and build a swarm whose agents can reach a point in two seconds" });
  }
  found.push(...runFindings(run.diagnostics, fileOf));
  notes.push(...runWarnings(run.diagnostics, fileOf));
  const again = replay(composed, { runtimes: running, packages }, JSON.parse(JSON.stringify(run.record())));
  if (again.ok) notes.push("run: replayed, same state hashes at every instant");
  else found.push(...runFindings(again.diagnostics, fileOf, "replay: "));
  return { diagnostics: found, plan: r.plan, notes };
}
