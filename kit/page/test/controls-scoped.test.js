// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// Part-qualified Controls on the page (Ben's ruling of 2026-11-27, leaf ZNpW0f): two FM synths from one package, a
// lead and a bass, each with keyed operator knobs (`ratio`, one per operator of its own record) and a keyed detune
// that writes back to its own params (`to: "param.<name>"`). The glue wires each exactly as one played alone. The page
// lists each instance's Controls by their page names (`<part>.<control>`), and a change to one reaches its own part
// alone and commits to its own part's Program.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPage } from "../index.js";
import { defineUI, defineRuntime } from "../../define/index.js";
import { compose, page } from "../../compose/index.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { g } from "../fixtures/synth-program.js";
import { SYNTH_INPUTS } from "../../define/fixtures/controls-dialects.js";

/** The duo: the lead has operators a and b and the param detune; the bass operator c and the params sub and drive. */
function duo() {
  const ui = defineUI(g, {
    controls: {
      ratio: { kind: "number", min: 0.25, max: 16, value: 1, each: (r) => Object.keys(r.ops).map((k) => ({ key: k, label: k, value: r.ops[k].ratio })) },
      volume: { kind: "number", min: 0, max: 2, value: 1, to: "param.level" },
    },
  });
  const rt = defineRuntime(g, {
    clock: () => ({ tick: 1 / 60 }), init: () => ({ voices: 0, ops: [] }),
    step: (s, c) => ({ ...s, voices: s.voices + c.inputs.ratio.length, ops: [...s.ops, ...c.inputs.ratio.map((r) => ({ key: r.key, value: r.value, x: 0, y: 0 }))].slice(-8) }),
    events: { in: Object.fromEntries(Object.keys(SYNTH_INPUTS).map((n) => [n, 8])) },
  });
  const lead = g("lead").param("level", { value: 1, min: 0, max: 2 }).op("a", { ratio: 2, level: 0.5 }).op("b", { ratio: 3, level: 1 });
  const bass = g("bass").param("level", { value: 0.5, min: 0, max: 2 }).op("c", { ratio: 0.5, level: 1 });
  let c = compose("duo").part(lead).part(bass);
  for (const p of [lead, bass]) c = c.wire(page.out.ratio, p.in.ratio).wire(page.out.volume, p.in.volume);
  const packages = [{ name: "synth", ui }];
  const composed = c.build({ runtimes: [rt], packages });
  const f = frames();
  const pg = createPage({ composed, runtimes: [rt], packages, context: fakeContext(), requestFrame: f.requestFrame });
  pg.start(); f.tick(0); f.tick(16);
  return { pg, f };
}

test("ZNpW0f. page.controls() lists each instance's keyed Control by its page name, with its own part's instances", () => {
  const { pg } = duo();
  const cs = pg.controls();
  assert.deepEqual(cs.map((c) => [c.name, c.part]), [["lead.ratio", "lead"], ["lead.volume", "lead"], ["bass.ratio", "bass"], ["bass.volume", "bass"]]);
  assert.deepEqual(cs.find((c) => c.name === "lead.ratio").instances.map((i) => [i.key, i.value]), [["a", 2], ["b", 3]]);
  assert.deepEqual(cs.find((c) => c.name === "bass.ratio").instances.map((i) => [i.key, i.value]), [["c", 0.5]]);
  assert.deepEqual([cs.find((c) => c.name === "bass.volume").to, cs.find((c) => c.name === "bass.volume").control], ["param.level", "volume"]);
});

test("ZNpW0f. both instances play: a keyed knob's record reaches its own part alone, and a release commits to its own part", () => {
  const { pg, f } = duo();
  pg.control("lead.ratio", { key: "b", value: 5 });
  pg.control("lead.ratio", { key: "a", value: 4 });
  pg.control("bass.ratio", { key: "c", value: 1.5 });
  f.tick(32); f.tick(48); f.tick(64);
  assert.deepEqual(pg.run.state("lead").ops.map((o) => [o.key, o.value]), [["b", 5], ["a", 4]]);
  assert.deepEqual(pg.run.state("bass").ops.map((o) => [o.key, o.value]), [["c", 1.5]]);
  assert.throws(() => pg.control("bass.ratio", { key: "a", value: 1 }), /no instance 'a'/, "the bass has no operator a");
  assert.deepEqual(pg.control("bass.volume", { value: 0.75 }), { part: "bass", to: "param.level", value: 0.75 });
  assert.deepEqual(pg.control("lead.volume", { value: 1.25 }), { part: "lead", to: "param.level", value: 1.25 });
  assert.throws(() => pg.control("ratio", { key: "a", value: 1 }), /lead\.ratio/, "the unqualified name is no page Control");
});
