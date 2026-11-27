// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// Page inputs from declared Controls (project/2026-11-27-controls-draft.md, requirements 1, 3 and 4; build plan groups
// 26 to 29 and 31): a `control` input is checked against the composed Control's seam; state records fold as a page
// wire always has (a keyed one per key), and delta records (triggers) carry over and are never dropped. A synth's
// notes and its operator knobs, not a game pad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay, RunError } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { defineUI, list } from "../../define/index.js";
import { tiny } from "./helpers.js";

const NOTES = "Event<{ index: f64, on: bool, velocity: f64 }>";
/** A synth on `clock` that keeps every record it takes, taking at most `max` of each input a step. */
function synth(clock = { tick: 1 / 4 }, max = 2) {
  const t = tiny("synth", {
    state: { notes: list("f64", 1000), Ts: list("f64", 1000), tempo: list("f64", 1000), ratios: list("str", 1000) }, inputs: false,
    ports: { in: { notes: { seam: NOTES }, tempo: { seam: "Event<{ value: f64 }>" }, ratio: { seam: "Event<{ key: str, value: f64 }>" } } },
  }, {
    clock: () => clock, events: { in: { notes: max, tempo: max, ratio: max } },
    init: () => ({ notes: [], Ts: [], tempo: [], ratios: [] }),
    step: (s, c) => ({
      notes: [...s.notes, ...c.inputs.notes.map((r) => (r.on ? r.index : -r.index))], Ts: [...s.Ts, ...c.inputs.notes.map((r) => r.$T)],
      tempo: [...s.tempo, ...c.inputs.tempo.map((r) => r.value)], ratios: [...s.ratios, ...c.inputs.ratio.map((r) => `${r.key}=${r.value}`)],
    }),
  });
  const ui = defineUI(t.grammar, { controls: {
    notes: { kind: "triggers", count: 12, first: 60 },
    tempo: { kind: "number", min: 40, max: 240, value: 120 },
    ratio: { kind: "number", min: 0.25, max: 16, value: 1, each: () => [{ key: "a" }, { key: "b" }] },
  } });
  const p = t.grammar("fm");
  const packages = [{ name: "synth", ui }];
  const composed = compose("play").part(p).wire(page.out.notes, p.in.notes).wire(page.out.tempo, p.in.tempo).wire(page.out.ratio, p.in.ratio).build({ runtimes: [t.runtime], packages });
  return { ...t, composed, packages, runtimes: [t.runtime] };
}
const note = (T, index, on = true) => ({ kind: "control", T, part: "page", name: "notes", value: { index, on, velocity: 1 } });

test("26. a control input is checked against the Control's seam (N012); an unknown Control is N013; a control to a user part is N011", () => {
  const s = synth();
  const run = createRun(s.composed, { runtimes: s.runtimes });
  const code = (e) => { try { run.input(e); return null; } catch (x) { assert.ok(x instanceof RunError, String(x)); return x.diagnostics[0].code; } };
  assert.equal(code({ kind: "control", T: 0.1, part: "page", name: "notes", value: { index: "C4", on: true, velocity: 1 } }), "N012");
  assert.equal(code({ kind: "control", T: 0.1, part: "page", name: "tempo", value: { value: 120, extra: 1 } }), "N012");
  assert.equal(code({ kind: "control", T: 0.1, part: "page", name: "pad", value: { up: true } }), "N013");
  assert.equal(code({ kind: "control", T: 0.1, part: "fm", name: "notes", value: { index: 1, on: true, velocity: 1 } }), "N011");
  assert.equal(code(note(0.1, 60)), null, "a fitting value is logged");
});

test("27. a state Control folds as before (the first max - 1, then the latest); a keyed one folds to each key's latest", () => {
  const s = synth();
  const tempo = (T, value) => ({ kind: "control", T, part: "page", name: "tempo", value: { value } });
  const ratio = (T, key, value) => ({ kind: "control", T, part: "page", name: "ratio", value: { key, value } });
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [tempo(0.1, 100), tempo(0.11, 110), tempo(0.12, 120), tempo(0.13, 130), ratio(0.1, "a", 1), ratio(0.11, "b", 2), ratio(0.12, "a", 3), ratio(0.13, "b", 4)] });
  run.runUntil(0.3);
  assert.deepEqual(run.state("fm").tempo, [100, 130]);
  assert.deepEqual(run.state("fm").ratios, ["a=3", "b=4"]);
});

test("28. a delta wire past its max carries over in order, $T kept, nothing dropped, counted, noted once; every way of running agrees", () => {
  const s = synth();
  const inputs = [note(0.1, 60), note(0.1, 62), note(0.1, 64), note(0.11, 60, false), note(0.11, 62, false), note(0.11, 64, false)];
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs });
  run.runUntil(2);
  assert.deepEqual(run.state("fm").notes, [60, 62, 64, -60, -62, -64]);
  assert.deepEqual(run.state("fm").Ts, [0.1, 0.1, 0.1, 0.11, 0.11, 0.11]);
  assert.equal(run.stats().carried["page.out.notes → fm.in.notes"], 4);
  assert.equal(run.diagnostics.filter((d) => d.code === "N001").length, 1);
  assert.deepEqual(run.stats().overflow, {}, "nothing dropped");
  const chunked = createRun(s.composed, { runtimes: s.runtimes, inputs });
  for (let t = 0.25; t <= 2; t += 0.25) chunked.runUntil(t);
  assert.deepEqual(chunked.state("fm").notes, run.state("fm").notes);
  run.rewind(0.2);
  run.runUntil(2);
  assert.deepEqual(run.state("fm").notes, chunked.state("fm").notes);
  assert.equal(replay(s.composed, { runtimes: s.runtimes, packages: s.packages }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});

test("29. a four-note chord in one frame reaches a consumer with max 2 whole, across steps", () => {
  const s = synth({ tick: 1 / 60 }, 2);
  const chord = [60, 64, 67, 71].flatMap((i) => [note(0.5, i)]);
  const off = [60, 64, 67, 71].map((i) => note(0.6, i, false));
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [...chord, ...off] });
  run.runUntil(1);
  assert.deepEqual(run.state("fm").notes, [60, 64, 67, 71, -60, -64, -67, -71]);
});

test("31. an input stamped between two steps is applied at its stamp, and its $T is the stamp", () => {
  const s = synth({ tick: 1 / 4 });
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [note("13/100", 60)] });
  run.runUntil(1);
  assert.deepEqual(run.state("fm").Ts, [0.13]);
});
