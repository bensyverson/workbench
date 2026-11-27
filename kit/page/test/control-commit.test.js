// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// A wired Control's commit is a value that checked out (leaf OttHk8): a param target is checked against the param's
// own declaration, so a page with no build, a build that gives no record, and a glue's rebuild that ignores params
// still refuse a value the param cannot take (H012, null, no throw); an argument target with no build is a host
// mistake that throws before the input is logged, and its message names the commit, not a preview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPage, examplePreset } from "../index.js";
import { defineUI, defineRuntime } from "../../define/index.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { HERE as SYNTH, g as synthG } from "../fixtures/synth-program.js";
import { SYNTH_INPUTS } from "../../define/fixtures/controls-dialects.js";

const TEXT = `import { g } from "${SYNTH}";
export default ($) => g("s")
  .param("gain", { value: 1, min: 0, max: 2 })
  .op("a", { ratio: 2, level: 0.5 })
  .op("b", { ratio: 3, level: 1 });
`;
const fromText = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`)).default;

/** The synth page: a wired `volume` on param.gain (the Control's own max is 100, the param's 2) and a keyed `ratio`. `build`: "preset", "none", or a function. */
async function mk(build) {
  const ui = defineUI(synthG, { controls: {
    volume: { kind: "number", min: 0, max: 100, value: 1, to: "param.gain" },
    ratio: { kind: "number", min: 0.25, max: 16, value: 1, each: () => [{ key: "a", value: 2, to: "arg.s.op#1:1.ratio" }] },
  } });
  const rt = defineRuntime(synthG, { clock: () => ({ tick: 1 / 60 }), init: () => ({ voices: 0, ops: [] }), step: (s) => s, events: { in: Object.fromEntries(Object.keys(SYNTH_INPUTS).map((n) => [n, 8])) } });
  const preset = examplePreset("synth", await fromText(TEXT), {}, { ui });
  const composed = preset.composition.build({ runtimes: [rt] });
  const f = frames();
  const run = build === "none" ? {} : { run: { build: build === "preset" ? preset.build : build } };
  const pg = createPage({ composed, runtimes: [rt], packages: [{ name: "synth", ui }], context: fakeContext(), requestFrame: f.requestFrame, texts: { s: TEXT }, ...run });
  pg.start(); f.tick(0); f.tick(16);
  return { pg, preset };
}
const h012 = (pg) => pg.diagnostics.filter((d) => d.code === "H012");
const controlInputs = (pg) => pg.run.log.inputs.filter((e) => e.kind === "control").length;

test("a param commit with no build is checked against the param's bounds: out of range gives null and H012", async () => {
  const { pg } = await mk("none");
  assert.equal(pg.control("s.volume", { value: 99 }), null);
  assert.equal(h012(pg).length, 1);
  assert.match(h012(pg)[0].message, /param\.gain/);
  assert.equal(pg.control("s.volume", { value: -0.5 }), null);
  assert.deepEqual(pg.control("s.volume", { value: 1.5 }), { part: "s", to: "param.gain", value: 1.5 }, "a value inside the bounds still commits");
  assert.deepEqual(pg.control("s.volume", { value: 2 }), { part: "s", to: "param.gain", value: 2 }, "the bound itself is inside");
});

test("a param commit is checked against the param's bounds when the build ignores params (a glue's rebuild)", async () => {
  const { pg, preset } = await mk((part, _params, more) => preset_build(part, more));
  function preset_build(part, more) { return preset.build(part, {}, more); }
  assert.equal(pg.control("s.volume", { value: 99 }), null);
  assert.equal(h012(pg).length, 1);
  assert.deepEqual(pg.control("s.volume", { value: 1.5 }), { part: "s", to: "param.gain", value: 1.5 });
});

test("a param commit whose build gives no record is refused, H012, as an argument's is", async () => {
  const { pg } = await mk(() => null);
  assert.equal(pg.control("s.volume", { value: 1.5 }), null);
  assert.match(h012(pg)[0].message, /no record/);
});

test("a param commit with a build that accepts still commits, and an out-of-bounds value is refused once with a build too", async () => {
  const { pg } = await mk("preset");
  assert.deepEqual(pg.control("s.volume", { value: 1.5 }), { part: "s", to: "param.gain", value: 1.5 });
  assert.equal(pg.control("s.volume", { value: 99 }), null);
  assert.equal(h012(pg).length, 1);
});

test("an argument commit with no build throws before the input is logged, naming the commit and the missing build", async () => {
  const { pg } = await mk("none");
  assert.equal(pg.control("s.ratio", { key: "a", value: 5 }, { phase: "preview" }), null, "a preview builds nothing");
  const before = controlInputs(pg);
  assert.throws(() => pg.control("s.ratio", { key: "a", value: 5 }), (e) => /build/.test(e.message) && !/preview/.test(e.message));
  assert.equal(controlInputs(pg), before, "the refused commit logged nothing");
});
