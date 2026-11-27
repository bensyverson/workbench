// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// A run whose every running part is on a demand clock (a package played or tested alone): an outside input makes an
// instant at its stamp for the demand part it reaches (Ben, 2026-11-27, issue qsEYlW, option (a)), so the run steps
// when played. Before the ruling such a run never stepped at all and N014 warned; N014 now names only what still
// waits: a delayed wire or a param wire into a demand part, whose value is read at the next instant, which only the
// next input makes. A game alone, a synth's MIDI notes and knob, and a lens bench's pointer and Grip.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { defineUI, list, pointerSeam, name, data } from "../../define/index.js";
import { mazeKit, CORRIDOR, STEER, rightAt, ticker, tiny, pair } from "./helpers.js";

const DEMAND = { demand: true };
const Ts = (run) => run.hashes.map((h) => h.T);

/** The maze on a demand clock, alone: one cell per step while the pad holds a direction. */
function game() {
  const M = mazeKit({ clock: () => DEMAND });
  const composed = compose("solo").part(M.grammar("level").grid(CORRIDOR).control(STEER)).build({ runtimes: [M.runtime] });
  return { composed, runtimes: [M.runtime] };
}

/** A demand voice: MIDI-style notes (triggers) and a knob (a number Control), each wired from the page. */
function voice() {
  const t = tiny("voice", {
    state: { notes: list("f64", 100), Ts: list("f64", 100), cutoff: "f64" }, inputs: false,
    ports: { in: { notes: { seam: "Event<{ index: f64, on: bool, velocity: f64 }>" }, cutoff: { seam: "Event<{ value: f64 }>" } } },
  }, {
    clock: () => DEMAND, events: { in: { notes: 4, cutoff: 4 } },
    init: () => ({ notes: [], Ts: [], cutoff: 0 }),
    step: (s, c) => ({ notes: [...s.notes, ...c.inputs.notes.map((r) => r.index)], Ts: [...s.Ts, ...c.inputs.notes.map(() => c.T)], cutoff: c.inputs.cutoff.at(-1)?.value ?? s.cutoff }),
  });
  const ui = defineUI(t.grammar, { controls: { notes: { kind: "triggers", count: 12, first: 60 }, cutoff: { kind: "number", min: 0, max: 1, value: 0.5 } } });
  const v = t.grammar("synth");
  const packages = [{ name: "voice", ui }];
  const composed = compose("play").part(v).wire(page.out.notes, v.in.notes).wire(page.out.cutoff, v.in.cutoff).build({ runtimes: [t.runtime], packages });
  return { composed, runtimes: [t.runtime], packages };
}
const note = (T, index) => ({ kind: "control", T, part: "page", name: "notes", value: { index, on: true, velocity: 1 } });
const knob = (T, value) => ({ kind: "control", T, part: "page", name: "cutoff", value: { value } });

const PARAM = { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" };
/** A demand lens render: its stage takes the pointer, and its run-time param `zoom` is what a Grip drags. */
function lens() {
  const t = tiny("lens", {
    state: { got: list("str", 100), zoom: "f64", steps: "f64" }, inputs: false, slots: { param: PARAM },
    frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
    ports: { in: { pointer: { seam: pointerSeam("px") } }, out: { view: { seam: "Draw<4>@px", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] } } },
  }, { clock: () => DEMAND, events: { in: { pointer: 8 } }, init: () => ({ got: [], zoom: 0, steps: 0 }), step: (s, c) => ({ got: [...s.got, ...c.inputs.pointer.map((r) => `${r.phase}${r.at[0]}`)], zoom: c.params.zoom, steps: s.steps + 1 }) });
  const ui = defineUI(t.grammar, { stage: { draw: "view", pointer: "pointer" } });
  const packages = [{ name: "lens", ui }];
  const part = () => t.grammar("bench").param("zoom", { value: 1, min: 0, max: 8 });
  const composed = compose("bench").part(part()).build({ runtimes: [t.runtime], packages });
  return { composed, runtimes: [t.runtime], packages, part };
}
const ptr = (T, phase, x) => ({ kind: "pointer", T, part: "bench", value: { phase, at: [x, 0], pointer: 1, buttons: 1, clicks: 1, wheel: [0, 0], hit: "", shift: false, alt: false, meta: false } });

test("a demand game played alone steps at each in record's stamp, and replays and rewinds to the same instants", () => {
  const g = game();
  const right = rightAt(0.1), again = { ...rightAt(0.3) };
  const run = createRun(g.composed, { runtimes: g.runtimes, inputs: [right, again] });
  run.runUntil(1);
  assert.deepEqual(Ts(run), ["1/10", "3/10"]);
  assert.deepEqual(run.state("level").player, { x: 3, y: 1 }, "one cell per record");
  assert.equal(run.state("level").score, 1);
  assert.equal(run.snapshot("level").T, "3/10");
  assert.equal(run.diagnostics.some((d) => d.code === "N014"), false);
  const rp = replay(g.composed, { runtimes: g.runtimes }, JSON.parse(JSON.stringify(run.record())));
  assert.deepEqual(rp.diagnostics, []);
  const before = JSON.stringify(run.hashes);
  run.rewind(0.2);
  assert.deepEqual(Ts(run), ["1/10"]);
  run.input(again);
  run.runUntil(1);
  assert.equal(JSON.stringify(run.hashes), before, "the rewound branch makes the same instants from the same log");
});

test("run.input with no stamp steps a demand-only run at once", () => {
  const g = game();
  const run = createRun(g.composed, { runtimes: g.runtimes });
  run.runUntil(1);
  const e = run.input({ kind: "in", part: "level", name: "pad", value: { up: false, down: false, left: false, right: true } });
  assert.equal(e.T.n / e.T.d, 1);
  assert.deepEqual(run.state("level").player, { x: 2, y: 1 });
  assert.equal(run.snapshot("level").T, "1");
});

test("a synth's notes and knob step a demand voice at their stamps (the non-game shape), and a replay matches", () => {
  const s = voice();
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [note(0.1, 60), note(0.25, 64), knob(0.4, 0.8), note(0.4, 67)] });
  run.runUntil(1);
  assert.deepEqual(Ts(run), ["1/10", "1/4", "2/5"]);
  assert.deepEqual(run.state("synth").notes, [60, 64, 67]);
  assert.deepEqual(run.state("synth").Ts, [0.1, 0.25, 0.4]);
  assert.equal(run.state("synth").cutoff, 0.8);
  assert.equal(replay(s.composed, { runtimes: s.runtimes, packages: s.packages }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("a lens bench's pointer and a Grip's param input step a demand render at their stamps", () => {
  const s = lens();
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [ptr(0.1, "down", 1), ptr(0.2, "up", 4)] });
  run.runUntil(0.5);
  assert.deepEqual(run.state("bench").got, ["down1", "up4"]);
  run.input({ kind: "param", T: 0.6, part: "bench", name: "zoom", value: 3 });
  run.runUntil(1);
  assert.deepEqual(Ts(run), ["1/10", "1/5", "3/5"]);
  assert.equal(run.state("bench").zoom, 3, "the Grip's preview reached a step");
  assert.equal(replay(s.composed, { runtimes: s.runtimes, packages: s.packages }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("a rebuild of a demand part alone (a Grip's commit on an argument) steps it at the rebuild's stamp", () => {
  const g = game();
  const run = createRun(g.composed, { runtimes: g.runtimes });
  run.input({ kind: "rebuild", T: 0.5, part: "level", record: { ...g.composed.parts[0].record, grid: ["#######", "#.c...#", "#######"] }, package: { content: "sha256-B" } });
  run.runUntil(1);
  assert.deepEqual(Ts(run), ["1/2"]);
  assert.equal(run.snapshot("level").revision, 2);
  assert.equal(run.snapshot("level").T, "1/2");
});

test("beside a clocked part, an input makes no instant of its own: the demand part steps at the next tick (S116 counts those)", () => {
  const M = mazeKit({ clock: () => DEMAND }), b = ticker("beat", { tick: 1 / 4 });
  const runtimes = [M.runtime, b.runtime];
  const composed = compose("two").part(M.grammar("level").grid(CORRIDOR).control(STEER)).part(b.part).build({ runtimes });
  const run = createRun(composed, { runtimes, inputs: [rightAt(0.3)] });
  run.runUntil(1);
  assert.deepEqual(Ts(run), ["0", "1/4", "1/2", "3/4", "1"]);
  assert.equal(run.snapshot("level").T, "1/2");
});

test("a param change wakes a demand part at an instant, as an Event or a changed value does", () => {
  const s = lens();
  const b = ticker("beat", { tick: 1 / 4 });
  const runtimes = [...s.runtimes, b.runtime];
  const c = compose("two").part(s.part()).part(b.part).build({ runtimes, packages: s.packages });
  const run = createRun(c, { runtimes, inputs: [{ kind: "param", T: 0.3, part: "bench", name: "zoom", value: 2 }] });
  run.runUntil(1);
  assert.equal(run.state("bench").zoom, 2);
  assert.equal(run.state("bench").steps, 2, "at 0, then at 1/2 after the param changed; not at 1/4, 3/4 or 1");
});

test("N014 names a delayed wire into a demand part in a run of demand parts only; an outside input alone is not warned", () => {
  const delayed = pair({ prodClock: DEMAND, consClock: DEMAND, wire: { delay: true } });
  const run = createRun(delayed.composed, { runtimes: delayed.runtimes });
  const n = run.diagnostics.filter((d) => d.code === "N014");
  assert.equal(n.length, 1);
  assert.equal(n[0].severity, "warning");
  assert.match(n[0].message, /a\.out\.e → b\.in\.e/);
  const P = tiny("prod", { state: { n: "f64" }, inputs: false, ports: { out: { v: { seam: "f64", from: "n" } } } }, { clock: () => DEMAND, init: () => ({ n: 0 }), step: (s) => s });
  const C = tiny("cons", { state: { k: "f64" }, inputs: false, ports: { out: {}, in: {} } }, { clock: () => DEMAND, init: () => ({ k: 0 }), step: (s) => s });
  const pa = P.grammar("a"), pb = C.grammar("b").param("level", { value: 0 });
  const viaParam = compose("w").part(pa).part(pb).wire(pa.out.v, pb.param.level).build({ runtimes: [P.runtime, C.runtime] });
  assert.match(createRun(viaParam, { runtimes: [P.runtime, C.runtime] }).diagnostics.find((d) => d.code === "N014")?.message ?? "", /a\.out\.v → b\.param\.level/);
  const undelayed = pair({ prodClock: DEMAND, consClock: DEMAND });
  assert.equal(createRun(undelayed.composed, { runtimes: undelayed.runtimes }).diagnostics.some((d) => d.code === "N014"), false);
  const g = game();
  assert.equal(createRun(g.composed, { runtimes: g.runtimes }).diagnostics.some((d) => d.code === "N014"), false);
  const beside = pair({ prodClock: DEMAND, consClock: DEMAND, wire: { delay: true }, extra: [ticker("beat", { tick: 1 / 4 })] });
  assert.equal(createRun(beside.composed, { runtimes: beside.runtimes }).diagnostics.some((d) => d.code === "N014"), false, "a clocked part makes the next instant");
});
