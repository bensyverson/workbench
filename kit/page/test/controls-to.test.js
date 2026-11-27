// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// Controls with `to` (project/2026-11-27-controls-draft.md, requirements 1, 2 and 8, "the kinds" and the Rulings;
// review of 787000e, leaf UYk5XG): a Control's change previews through the log as a Grip's drag does (a Control with
// an input carries the live value through it; a part-local one previews its target: a param input, or a rebuild built
// with the argument overridden, at most once a frame), and its release gives the commit `{ part, to, value }` for the
// host to write back; a target that cannot be written is H011. page.controls() lists part-local Controls and each
// keyed Control's instances with their `to`. The FM synth (keyed operator knobs with `to`, a part-local param knob) and
// the lens bench (a part-local keyed radius over its lenses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPage, examplePreset, writeBack } from "../index.js";
import { defineUI, defineRuntime, run } from "../../define/index.js";
import { compose } from "../../compose/index.js";
import { fakeContext, frames } from "../fixtures/bench.js";
import { HERE as SYNTH, g as synthG } from "../fixtures/synth-program.js";
import { SYNTH_INPUTS } from "../../define/fixtures/controls-dialects.js";
import { lens, HERE as LENS } from "../fixtures/lens-program.js";
import { createSession } from "../host/session.js";

const fromText = async (text) => (await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`)).default;

const SYNTH_TEXT = `import { g } from "${SYNTH}";
export default ($) => g("s")
  .param("gain", { value: 1, min: 0, max: 2 })
  .op("a", { ratio: 2, level: 0.5 })
  .op("b", { ratio: 3, level: 1 });
`;

/** The synth played alone: operator knobs keyed by operator, each writing its ratio back, and a part-local gain knob. */
async function synth(more = {}) {
  const fn = await fromText(SYNTH_TEXT);
  const ui = defineUI(synthG, {
    controls: {
      ratio: { kind: "number", min: 0.25, max: 16, value: 1, look: "knob", each: (r) => Object.keys(r.ops).map((k, i) => ({ key: k, label: k, value: r.ops[k].ratio, to: `arg.s.op#${i}:1.ratio` })).concat(more.stray ? [{ key: "x", value: 1, to: "arg.s.op#9:1.ratio" }] : []) },
      detune: { kind: "number", min: 0, max: 2, value: 1, to: "param.gain", label: "gain" },
    },
  });
  const rt = defineRuntime(synthG, { clock: () => ({ tick: 1 / 60 }), init: () => ({ voices: 0, ops: [] }), step: (s, c) => ({ ...s, voices: s.voices + c.inputs.ratio.length }), events: { in: Object.fromEntries(Object.keys(SYNTH_INPUTS).map((n) => [n, 8])) } });
  const preset = examplePreset("synth", fn, {}, { ui });
  const packages = [{ name: "synth", ui }];
  const composed = preset.composition.build({ runtimes: [rt] });
  const f = frames();
  const pg = createPage({ composed, runtimes: [rt], packages, context: fakeContext(), requestFrame: f.requestFrame, texts: { s: SYNTH_TEXT }, run: { build: preset.build } });
  pg.start(); f.tick(0); f.tick(16);
  return { pg, f, fn, composed, rt, packages, preset };
}

test("UYk5XG. page.controls() lists a keyed Control's instances with their to, and a part-local Control with its part and to", async () => {
  const { pg } = await synth();
  const cs = pg.controls();
  assert.deepEqual(cs.map((c) => c.name), ["s.ratio", "s.detune"]);
  const ratio = cs.find((c) => c.name === "s.ratio");
  assert.equal(ratio.keyed, true);
  assert.deepEqual(ratio.instances.map((i) => [i.key, i.value, i.to, i.disabled]), [["a", 2, "arg.s.op#0:1.ratio", null], ["b", 3, "arg.s.op#1:1.ratio", null]]);
  const detune = cs.find((c) => c.name === "s.detune");
  assert.deepEqual([detune.local, detune.part, detune.to, detune.disabled], [true, "s", "param.gain", null]);
});

test("UYk5XG. a keyed knob with an input carries the live value through it, and its release gives the commit the host writes back", async () => {
  const { pg, f } = await synth();
  assert.equal(pg.control("s.ratio", { key: "b", value: 5 }, { phase: "preview" }), null, "a preview commits nothing");
  const commit = pg.control("s.ratio", { key: "b", value: 6 });
  assert.deepEqual(commit, { part: "s", to: "arg.s.op#1:1.ratio", value: 6 });
  assert.deepEqual(pg.run.log.inputs.filter((e) => e.kind === "control").map((e) => [e.name, e.value]), [["s.ratio", { key: "b", value: 5 }], ["s.ratio", { key: "b", value: 6 }]]);
  assert.equal(pg.run.log.inputs.filter((e) => e.kind === "rebuild").length, 0, "the input carries it: no preview rebuild");
  const w = writeBack(SYNTH_TEXT, pg.run.composed.parts.find((p) => p.name === "s").record, commit.to, commit.value);
  assert.equal(w.ok, true, w.message);
  assert.ok(w.text.includes(`.op("b", { ratio: 6, level: 1 })`));
  f.tick(32); f.tick(48); f.tick(64);
  assert.equal(pg.run.state("s").voices, 2, "the part took both records");
});

test("UYk5XG. a part-local param Control previews a param input at most once a frame, and its release commits to the declaration", async () => {
  const { pg, f } = await synth();
  pg.control("s.detune", { value: 1.2 }, { phase: "preview" });
  pg.control("s.detune", { value: 1.4 }, { phase: "preview" });
  f.tick(32);
  assert.deepEqual(pg.run.log.inputs.filter((e) => e.kind === "param").map((e) => [e.part, e.name, e.value]), [["s", "gain", 1.4]]);
  assert.equal(pg.run.log.inputs.filter((e) => e.kind === "control").length, 0, "a part-local Control is never a page input");
  const commit = pg.control("s.detune", { value: 1.5 });
  assert.deepEqual(commit, { part: "s", to: "param.gain", value: 1.5 });
  assert.deepEqual(pg.run.log.inputs.filter((e) => e.kind === "param").map((e) => e.value), [1.4, 1.5], "the release is logged at once");
  assert.equal(writeBack(SYNTH_TEXT, pg.run.composed.parts.find((p) => p.name === "s").record, commit.to, commit.value).ok, true);
});

test("UYk5XG. a target that cannot be written back is H011: the instance is listed disabled, its input still plays, and it commits nothing", async () => {
  const { pg } = await synth({ stray: true });
  const x = pg.controls().find((c) => c.name === "s.ratio").instances.find((i) => i.key === "x");
  assert.equal(x.disabled.code, "H011");
  assert.ok(pg.diagnostics.some((d) => d.code === "H011" && /ratio/.test(d.message)), JSON.stringify(pg.diagnostics));
  assert.equal(pg.control("s.ratio", { key: "x", value: 2 }), null);
  assert.equal(pg.run.log.inputs.filter((e) => e.kind === "control").length, 1, "the live value still went through the input");
  assert.deepEqual(pg.control("s.ratio", { key: "a", value: 4 }), { part: "s", to: "arg.s.op#0:1.ratio", value: 4 }, "the other instances still commit");
  assert.throws(() => pg.control("nope", { value: 1 }), /nope/);
  assert.throws(() => pg.control("s.ratio", { key: "zz", value: 1 }), /zz/, "an instance the Control lacks");
});

const LENS_TEXT = `import { g } from "${LENS}";
export default ($) => g("b")
  .lens({ radius: 10, at: [20, 30] })
  .lens({ radius: 25, at: [60, 70] });
`;

/** The lens bench: a part-local radius per lens (each over the record's lenses), writing each lens's radius back. */
async function bench(entries) {
  const fn = await fromText(LENS_TEXT);
  const ui = defineUI(lens.grammar, {
    controls: { radius: { kind: "number", min: 1, max: 40, value: 10, each: entries ?? ((r) => r.lens.map((l, i) => ({ key: String(i), value: l.radius, to: `arg.b.lens#${i}:0.radius` }))) } },
  });
  const record = run(fn).record;
  const packages = [{ name: "lens", ui }];
  const bp = lens.grammar("b");
  const composed = compose("bench").part(bp).show(bp).build({ runtimes: [lens.runtime], packages });
  composed.parts = composed.parts.map((p) => (p.name === "b" ? { ...p, record } : p));
  const f = frames();
  const build = (_part, values, more = {}) => run(fn, { values, ...(more.args ? { args: more.args } : {}) }).record;
  const pg = createPage({ composed, runtimes: [lens.runtime], packages, context: fakeContext(), requestFrame: f.requestFrame, texts: { b: LENS_TEXT }, run: { build } });
  pg.start(); f.tick(0); f.tick(16);
  return { pg, f, composed, packages };
}

test("UYk5XG. a part-local keyed Control (one radius per lens) previews by a rebuild with the argument overridden, once a frame, and commits its entry's to", async () => {
  const { pg, f } = await bench();
  const radius = pg.controls().find((c) => c.name === "b.radius");
  assert.deepEqual([radius.local, radius.part, radius.instances.map((i) => [i.key, i.to])], [true, "b", [["0", "arg.b.lens#0:0.radius"], ["1", "arg.b.lens#1:0.radius"]]]);
  pg.control("b.radius", { key: "1", value: 30 }, { phase: "preview" });
  pg.control("b.radius", { key: "1", value: 31 }, { phase: "preview" });
  f.tick(32);
  const rebuilds = pg.run.log.inputs.filter((e) => e.kind === "rebuild");
  assert.deepEqual(rebuilds.map((e) => e.record.lens.map((l) => l.radius)), [[10, 31]], "one rebuild for the frame, built with the override");
  const commit = pg.control("b.radius", { key: "1", value: 32 });
  assert.deepEqual(commit, { part: "b", to: "arg.b.lens#1:0.radius", value: 32 });
  const w = writeBack(LENS_TEXT, pg.run.composed.parts.find((p) => p.name === "b").record, commit.to, commit.value);
  assert.equal(w.ok, true, w.message);
  assert.ok(w.text.includes(".lens({ radius: 32, at: [60, 70] })"));
  // a value the Grammar refuses previews nothing and is reported, as a Grip's (H012)
  pg.control("b.radius", { key: "0", value: 99 }, { phase: "preview" });
  f.tick(48);
  assert.equal(pg.status().halted, null);
  assert.ok(pg.diagnostics.some((d) => d.code === "H012"));
});

test("UYk5XG. the host's generated forms list part-local Controls and a keyed Control's instances, and its control() goes through the page", async () => {
  const { composed, packages } = await bench();
  const fn = await fromText(LENS_TEXT);
  const f = frames();
  const loaded = { composed, runtimes: [lens.runtime], packages: packages.map((p) => ({ name: p.name, loaded: { ui: p.ui } })), rebuild: (_part, values, more = {}) => run(fn, { values, ...(more.args ? { args: more.args } : {}) }).record, diagnostics: [] };
  const commits = [];
  const s = createSession(loaded, { context: fakeContext(), requestFrame: f.requestFrame, onCommit: (c) => commits.push(c) });
  s.start(); f.tick(0); f.tick(16);
  const form = s.forms().find((x) => x.name === "b.radius");
  assert.ok(form, JSON.stringify(s.forms().map((x) => x.name)));
  assert.deepEqual([form.local, form.keyed, form.instances.map((i) => i.key)], [true, true, ["0", "1"]]);
  assert.deepEqual(s.control("b.radius", { key: "0", value: 11 }, { phase: "preview" }), []);
  assert.deepEqual(s.control("b.radius", { key: "0", value: 12 }), []);
  assert.deepEqual(commits, [{ part: "b", to: "arg.b.lens#0:0.radius", value: 12 }], "a release gives the commit to the host's write-back");
});

test("FtbfNP. a wired keyed Control's form says it is keyed, though its composed declaration has no each, and lists its instances", async () => {
  const { composed, rt, packages, preset } = await synth();
  const f = frames();
  const s = createSession({ composed, runtimes: [rt], packages: packages.map((p) => ({ name: p.name, loaded: { ui: p.ui } })), rebuild: preset.build, diagnostics: [] }, { context: fakeContext(), requestFrame: f.requestFrame });
  const ratio = s.forms().find((x) => x.name === "s.ratio");
  assert.equal(ratio.each, undefined, "plain data");
  assert.deepEqual([ratio.keyed, ratio.instances.map((i) => i.key)], [true, ["a", "b"]]);
  assert.equal(s.forms().find((x) => x.name === "s.detune").keyed, false);
});

test("x3LcAJ. a wired Control's commit is checked by a build: a value the Grammar refuses gives null and H012, a value that builds still commits", async () => {
  const { pg } = await synth();
  const refused = pg.control("s.ratio", { key: "b", value: 1000 });
  assert.equal(refused, null, "ratio is bounded to 16 by the Grammar: no build accepts 1000");
  assert.deepEqual(pg.diagnostics.map((d) => d.code), ["H012"]);
  const ok = pg.control("s.ratio", { key: "b", value: 5 });
  assert.deepEqual(ok, { part: "s", to: "arg.s.op#1:1.ratio", value: 5 });
  const w = writeBack(SYNTH_TEXT, pg.run.composed.parts.find((p) => p.name === "s").record, ok.to, ok.value);
  assert.equal(w.ok, true, "and the commit writes");
  assert.ok(run(await fromText(w.text)).record, "into a text that builds");
  assert.equal(pg.control("s.ratio", { key: "b", value: 1000 }, { phase: "preview" }), null, "a preview of a wired Control builds nothing and reports nothing new");
});

test("SO79nL. a Control's commit is rounded once: the preview and the value returned are the number the text will hold", async () => {
  const { pg, f } = await synth();
  pg.control("s.detune", { value: 1.2000000000000002 }, { phase: "preview" });
  f.tick(32);
  assert.equal(pg.run.log.inputs.filter((e) => e.kind === "param").at(-1).value, 1.2, "the preview is rounded");
  assert.equal(pg.control("s.detune", { value: 1.4000000000000001 }).value, 1.4);
  assert.equal(pg.control("s.ratio", { key: "b", value: 0.1 + 0.2 }).value, 0.3);
});
