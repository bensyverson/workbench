// The rerun's checker (leaf WnmLua): each leg's hand-in checked on the real kit and run on kit/run. The reference
// hand-ins (fixtures/valid-2, written from docs/ only) pass; each rule the checker holds refuses a copy broken in
// exactly that way, and still passes what it should.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLeg, bornNear, stateProblems, portProblems } from "../checker/legs.js";
import { handIn, remove, sub, FIXTURES_2 } from "../fixture-copy.js";

const TRIGGER_LOOP = "for (const ev of inputs[e.opts.trigger] ?? []) for (let i = 0; i < (e.opts.perEvent ?? PER_EVENT); i++) at.push(ev);";
const SPAWNED = "if (!p.dead) { next.push(stored(p, e.name)); live[e.name] += 1; }";
/**
 * Edits a particles runtime into a marker system: its trigger emitter spawns one long-lived particle at T = 0, and
 * each record only moves that particle to the record's position. With `burst` it also spawns the real burst.
 * @param {string} dir @param {boolean} burst @param {string} prefix
 */
function markerSystem(dir, burst, prefix) {
  const file = `${prefix}particles.runtime.js`;
  const move = "const m = next.find((q) => q.life === 1e9); if (m) { m.x = ev.at[0]; m.y = ev.at[1]; }";
  const more = burst ? " for (let i = 0; i < (e.opts.perEvent ?? PER_EVENT); i++) at.push(ev);" : "";
  sub(dir, file, TRIGGER_LOOP, `{ if (state.t === 0) at.push({ at: [0, 0], marker: true }); for (const ev of inputs[e.opts.trigger] ?? []) { ${move}${more} } }`);
  sub(dir, file, SPAWNED, "if (!p.dead) { const q = stored(p, e.name); if (ev.marker) q.life = 1e9; next.push(q); live[e.name] += 1; }");
}

/** The codes a broken copy of the reference hand-in gets. @param {"maze" | "particles" | "compose"} role @param {(d: string) => void} [edit] */
async function codes(role, edit) {
  const dir = await handIn(role, edit, { from: FIXTURES_2 });
  try {
    const r = await checkLeg(dir, role);
    return { codes: r.diagnostics.map((d) => d.code), r };
  } finally { remove(dir); }
}

test("the reference maze hand-in passes: loaded, its runtime run on both examples, a coin record pushed", async () => {
  const { codes: c, r } = await codes("maze");
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(c, []);
  assert.ok(r.notes.some((n) => /examples\/01\.js: coin at \(1, 3\) picked at T = 0\.125; coin: \[\{"cell":\[1,3\]\}\]/.test(n)), r.notes.join("\n"));
});

test("the reference particles hand-in passes: a probe record on burst makes particles appear at it", async () => {
  const { r } = await codes("particles");
  assert.deepEqual(r.diagnostics, []);
  assert.ok(r.notes.some((n) => /examples\/07\.js: a burst record at \(160, 120\) at T = 0\.5: \d+ particles within/.test(n)), r.notes.join("\n"));
});

test("the reference composition passes: checked, planned with a rename, run to a burst at the pickup, replayed", async () => {
  const { r } = await codes("compose");
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.plan, ["level.out.coin → fx.in.burst: at: maze.cell → particles.px, point, ×32 +16 (fit at line 42: [-0.5, -0.5]..[9.5, 6.5] in [0, 0]..[320, 224])"]);
  assert.ok(r.notes.some((n) => /^run: coin at \(1, 3\) picked at T = 0\.125/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.some((n) => /^run: burst of 24 particles within 32 of \(48, 112\) in particles\.px at T = 0\.133/.test(n)), r.notes.join("\n"));
  assert.ok(r.notes.includes("run: replayed, same state hashes at every instant"), r.notes.join("\n"));
});

test("G001: an author's package with no runtime", async () => {
  const { codes: c } = await codes("maze", (d) => { sub(d, "wb-package.json", ',\n    "runtime": "maze.runtime.js"', ""); sub(d, "maze.runtime.js", "export const mazeRuntime", "const mazeRuntime"); });
  assert.ok(c.includes("G001"), c.join(" "));
});

test("G002: the version is not raised", async () => {
  const { codes: c } = await codes("maze", (d) => { sub(d, "wb-package.json", '"version": "0.2.0"', '"version": "0.1.0"'); });
  assert.deepEqual(c, ["G002"]);
});

test("G003: no new example", async () => {
  const { codes: c } = await codes("maze", (d) => { sub(d, "wb-package.json", ',\n    "examples/02.js"', ""); sub(d, "examples/02.js", "maze(", "maze("); });
  assert.ok(c.includes("G003"), c.join(" "));
});

test("G006: a runtime that ignores the pad input never reaches a coin", async () => {
  const { codes: c } = await codes("maze", (d) => { sub(d, "maze.runtime.js", "const pad = inputs.pad.length ? inputs.pad.at(-1) : state.pad;", "const pad = state.pad;"); });
  assert.ok(c.length > 0 && c.every((x) => x === "G006"), c.join(" "));
});

test("G007: a runtime that picks the coin but pushes no record", async () => {
  const { codes: c } = await codes("maze", (d) => { sub(d, "maze.runtime.js", "events.coin.push({ cell: [x, y] });", ""); });
  assert.ok(c.length > 0 && c.every((x) => x === "G007"), c.join(" "));
});

test("N codes: a runtime that changes the state it is handed stops with N003, at the runtime's file", async () => {
  const { codes: c, r } = await codes("maze", (d) => { sub(d, "maze.runtime.js", "return { ...state, pad:", "state.t = 1; return { ...state, pad:"); });
  assert.ok(c.includes("N003"), c.join(" "));
  assert.ok(r.diagnostics.filter((x) => x.code === "N003").every((x) => x.file === "maze.runtime.js"));
});

test("G008: a particles runtime that ignores its Event input", async () => {
  const { codes: c } = await codes("particles", (d) => { sub(d, "particles.runtime.js", "if (e.opts.trigger)", "if (e.opts.trigger === 'never')"); });
  assert.deepEqual(c, ["G008"]);
});

test("G010: a glue with no wire from the maze to the particles", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", '    .wire(level.out.coin, fx.in.burst, { rename: { cell: "at" } })\n', ""); });
  assert.deepEqual(c, ["G010"]);
});

test("G011: a glue that shows the maze", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", ".show(fx)", ".show(level)"); });
  assert.deepEqual(c, ["G011"]);
});

test("G012: a glue whose player never walks", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", "pl.steps = 1;", "pl.steps = 0;"); });
  assert.deepEqual(c, ["G012"]);
});

test("G013: a glue whose frame edge puts the burst off the box", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", '.frame(level.frame.cell, fx.frame.px, "fit")', ".frame(level.frame.cell, fx.frame.px, { scale: 32, offset: 1000 })"); });
  assert.deepEqual(c, ["G013"]);
});

test("a composition refused by the kit stops before the run, with the kit's code", async () => {
  const { codes: c } = await codes("compose", (d) => { sub(d, "workbench.js", ', { rename: { cell: "at" } }', ""); });
  assert.deepEqual(c, ["S202"]);
});

test("S116 (from the runtimes' Event maxes) is a diagnostic at the glue's line, not a checker failure", async () => {
  const { codes: c, r } = await codes("compose", (d) => { sub(d, "maze/maze.runtime.js", "const MAX_STEPS = 4;", "const MAX_STEPS = 64;"); });
  assert.deepEqual(c, ["S116"]);
  assert.equal(r.diagnostics[0].file, "workbench.js");
  assert.match(r.diagnostics[0].message, /takes at most 8 per step/);
});

test("with an overflow policy S116 is a warning: printed as a note, and the leg passes (leaf UTdvE6)", async () => {
  const { codes: c, r } = await codes("compose", (d) => {
    sub(d, "maze/maze.runtime.js", "const MAX_STEPS = 4;", "const MAX_STEPS = 64;");
    sub(d, "workbench.js", '{ rename: { cell: "at" } }', '{ rename: { cell: "at" }, overflow: "keepLast" }');
  });
  assert.deepEqual(c, []);
  assert.ok(r.notes.some((n) => /^workbench\.js:\d+: S116 \(warning\) .*keepLast/.test(n)), r.notes.join("\n"));
});

test("G005: the state the checker reads, by role", () => {
  assert.deepEqual(stateProblems({ player: { x: 1, y: 2 }, grid: ["#"] }, "maze"), []);
  assert.match(stateProblems({ hero: { x: 1, y: 2 }, grid: ["#"] }, "maze").join(), /player\.x/);
  assert.match(stateProblems({ player: { x: 1, y: 2 } }, "maze").join(), /grid/);
  assert.deepEqual(stateProblems({ particles: [{ x: 1, y: 2 }] }, "particles"), []);
  assert.deepEqual(stateProblems({ particles: [] }, "particles"), []);
  assert.match(stateProblems({ particles: [{ pos: [1, 2] }] }, "particles").join(), /x and y/);
  assert.match(stateProblems({ dots: [] }, "particles").join(), /particles/);
});

test("G004: the ports each author's task asks for", () => {
  const ev = { seam: { kind: "event", of: { kind: "record", fields: {} } } };
  const val = { seam: { kind: "scalar", of: "f64" } };
  const dialect = (/** @type {any} */ out, /** @type {any} */ inn, inputs = { name: "inp" }) => ({ seams: { out, in: inn, inputs } });
  assert.deepEqual(portProblems(dialect({ a: ev }, {}), "maze", { grammar: "", examples: [] }), []);
  assert.match(portProblems(dialect({ a: val }, {}), "maze", { grammar: "", examples: [] }).join(), /Event output/);
  const good = { grammar: 'trigger: ref("in", { kind: "event" })', examples: ["p.vel = inp.speed"] };
  assert.deepEqual(portProblems(dialect({}, { b: ev, s: val }), "particles", good), []);
  assert.match(portProblems(dialect({}, { s: val }), "particles", good).join(), /Event input/);
  assert.match(portProblems(dialect({}, { b: ev }), "particles", good).join(), /value input/);
  assert.match(portProblems(dialect({}, { b: ev, s: val }), "particles", { ...good, examples: ["p.vel = vec2(0, 1)"] }).join(), /reads/);
  assert.match(portProblems(dialect({}, { b: ev, s: val }), "particles", { ...good, grammar: "" }).join(), /ref\("in"/);
});

test("G013: a marker that only follows the record is not a burst; with a real burst added it passes", async () => {
  const { codes: c, r } = await codes("compose", (d) => markerSystem(d, false, "particles/"));
  assert.deepEqual(c, ["G013"], r.diagnostics.map((x) => x.message).join("\n"));
  assert.match(r.diagnostics[0].message, /no particles were born/);
  const { codes: ok } = await codes("compose", (d) => markerSystem(d, true, "particles/"));
  assert.deepEqual(ok, []);
});

/**
 * A marker system whose real burst is born 500 units from the record: only the marker is near it.
 * @param {string} dir @param {string} prefix
 */
function misplacedBurst(dir, prefix) {
  const file = `${prefix}particles.runtime.js`;
  const move = "const m = next.find((q) => q.life === 1e9); if (m) { m.x = ev.at[0]; m.y = ev.at[1]; }";
  const elsewhere = " for (let i = 0; i < (e.opts.perEvent ?? PER_EVENT); i++) at.push({ at: [ev.at[0] + 500, ev.at[1] + 500] });";
  sub(dir, file, TRIGGER_LOOP, `{ if (state.t === 0) at.push({ at: [0, 0], marker: true }); for (const ev of inputs[e.opts.trigger] ?? []) { ${move}${elsewhere} } }`);
  sub(dir, file, SPAWNED, "if (!p.dead) { const q = stored(p, e.name); if (ev.marker) q.life = 1e9; next.push(q); live[e.name] += 1; }");
}

test("G008 and G013: a burst born far from the record, beside a marker that follows it, is not a burst near it", async () => {
  const { codes: c } = await codes("particles", (d) => misplacedBurst(d, ""));
  assert.deepEqual(c, ["G008"]);
  const { codes: g } = await codes("compose", (d) => misplacedBurst(d, "particles/"));
  assert.deepEqual(g, ["G013"]);
});

test("bornNear counts particles born within the radius, never ones that moved there, and refuses a missing baseline", () => {
  const base = { particles: [{ x: 100, y: 0 }, { x: 5, y: 5 }] };
  const moved = { particles: [{ x: 0.5, y: 0 }, { x: 5, y: 5 }] };
  assert.equal(bornNear(base, base, [0, 0], 1), 0);
  assert.equal(bornNear(moved, base, [0, 0], 1), 0);
  assert.equal(bornNear({ particles: [...base.particles, { x: 0.1, y: 0 }, { x: 0.2, y: 0 }] }, base, [0, 0], 1), 2);
  assert.equal(bornNear({ particles: [...moved.particles, { x: 0.1, y: 0 }] }, base, [0, 0], 1), 1);
  assert.equal(bornNear({ particles: [...moved.particles, { x: 400, y: 0 }, { x: 500, y: 0 }] }, base, [0, 0], 1), 0);
  assert.throws(() => bornNear(base, undefined, [0, 0], 1), /baseline/);
});

test("G008: a marker that only follows the record is not a burst; with a real burst added it passes", async () => {
  const { codes: c } = await codes("particles", (d) => markerSystem(d, false, ""));
  assert.deepEqual(c, ["G008"]);
  const { codes: ok } = await codes("particles", (d) => markerSystem(d, true, ""));
  assert.deepEqual(ok, []);
});
