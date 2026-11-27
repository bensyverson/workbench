// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// The stage side of declared Controls on the host (project/2026-11-27-controls-draft.md, requirements 7 to 10 and "In
// a composition"), on the lens bench, a real package (examples/lens) loaded as a preset: Grips drawn over the
// canvas follow the zoom and pan; a Grip dragged and released writes its literal back into the example's text, one
// undo step, whose rebuild is logged; an undo builds the previous text; a custom element stage's wb-control, wb-param
// and wb-edit are checked and logged, or refused with the kit's own code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { loadPreset, reloadText } from "../load.js";
import { createSession } from "../session.js";
import { createEditor, rebuildWith } from "../editor.js";
import { fakeContext, frames } from "../../fixtures/bench.js";

const kit = (p) => new URL(`../../../${p}`, import.meta.url).href;
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const LENS = readPackageDir(fileURLToPath(new URL("../../../../examples/lens", import.meta.url)));

/** The lens bench as the page runs it: its preset loaded, a session, and an editor on the example's text whose commits write back. */
async function lensBench(example) {
  // an edited example is the text built on the loaded package (its hash is the shipped file's)
  const first = await loadPreset({ packages: { lens: LENS }, package: "lens", example: "examples/bench.js" }, env);
  const loaded = example ? await reloadText(first, example, env) : first;
  assert.deepEqual(loaded.diagnostics.filter((d) => d.severity === "error"), []);
  const f = frames();
  const commits = [];
  const said = [];
  const current = { loaded, session: null };
  let editor = null;
  const remounts = [];
  current.session = createSession(loaded, {
    context: fakeContext(), requestFrame: f.requestFrame,
    onCommit: (c) => { commits.push(c); editor.write(c).then((r) => { if (!r.ok) said.push(...r.diagnostics); }); },
  });
  editor = createEditor({
    text: loaded.source,
    recordOf: (part) => current.session.recordOf(part),
    rebuild: rebuildWith({ reload: (t) => reloadText(current.loaded, t, env), current: () => current, remount: (next, why) => { remounts.push(why); current.loaded = next; } }),
  });
  current.session.start(); f.tick(0); f.tick(16);
  return { ...current, current, f, editor, commits, said, remounts, rebuilds: () => current.session.page.run.log.inputs.filter((e) => e.kind === "rebuild") };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test("the lens bench: a Grip dragged over the canvas previews, and its release writes back into the text as one undo step, rebuilt and logged", async () => {
  const b = await lensBench();
  const s = b.session;
  const marks = s.grips();
  assert.deepEqual(marks.map((m) => [m.grip, m.index, m.x, m.y, m.disabled]), [["radius", 0, 42, 40, null], ["radius", 1, 85, 60, null], ["move", 0, 30, 40, null], ["move", 1, 65, 60, null]], "canvas pixels, no zoom");
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 41);
  b.f.tick(32);
  assert.equal(b.rebuilds().at(-1).record.lens[0].radius, 17, "the preview is a logged rebuild");
  const commit = drag.release();
  assert.deepEqual(commit, { part: "bench", to: "arg.bench.lens#0:0.radius", value: 17 });
  assert.deepEqual(b.commits, [commit], "the release went to onCommit");
  await settle(); await settle();
  assert.deepEqual(b.said, []);
  assert.match(b.editor.text, /\.lens\(\{ radius: 17, at: \[30, 40\] \}\)/, "written back");
  assert.equal(s.texts.bench, b.editor.text, "the page's text is the new one");
  const after = b.rebuilds().at(-1);
  assert.equal(after.record.lens[0].radius, 17);
  assert.equal(b.editor.canUndo, true);
  b.f.tick(48);
  // a second drag starts from the written text: no stale span
  const again = s.grab({ part: "bench", grip: "radius", index: 0 }, 47, 40);
  again.move(49, 40);
  b.f.tick(64);
  again.release();
  await settle(); await settle();
  assert.deepEqual(b.said, [], "the second release wrote too");
  assert.match(b.editor.text, /radius: 19, at: \[30, 40\]/);
  const u = await b.editor.undo();
  assert.equal(u.ok, true);
  assert.match(b.editor.text, /radius: 17, at: \[30, 40\]/);
  assert.equal(b.rebuilds().at(-1).record.lens[0].radius, 17, "the undo is a logged rebuild");
  assert.deepEqual(b.remounts, [], "no reload: the parts and wires did not change");
});

test("the Grips over the canvas follow the zoom and pan, and a drag on a zoomed stage moves by stage units", async () => {
  const b = await lensBench();
  const s = b.session;
  s.setView({ zoom: 2, pan: [10, -5] });
  const m = s.grips().find((g) => g.grip === "move" && g.index === 0);
  assert.deepEqual([m.x, m.y], [30 * 2 + 10, 40 * 2 - 5]);
  assert.deepEqual(s.page.toStage(70, 75), [30, 40], "the page undoes it in pointer mapping");
  const drag = s.grab({ part: "bench", grip: "move", index: 0 }, 70, 75);
  drag.move(80, 75);
  b.f.tick(32);
  assert.deepEqual(drag.release().value, [35, 40], "ten canvas pixels at zoom 2 are five units");
  s.fit();
  assert.deepEqual(s.view, { zoom: 1, pan: [0, 0] });
});

test("a Grip whose argument is not a literal is drawn disabled with its H011", async () => {
  const text = LENS["examples/bench.js"].toString().replace('.lens({ radius: 12, at: [30, 40] })', ".lens({ radius: 6 * 2, at: [30, 40] })");
  const b = await lensBench(text);
  const m = b.session.grips().find((g) => g.grip === "radius" && g.index === 0);
  assert.equal(m.disabled?.code, "H011");
  assert.match(m.disabled.message, /6 \* 2/);
  assert.equal(b.session.grips().find((g) => g.grip === "radius" && g.index === 1).disabled, null, "the other lens is a literal");
});

test("Apply of a text that changes the composition's parts reloads it as a new run, and says why", async () => {
  const b = await lensBench();
  const r = await b.editor.apply(b.editor.text.replace('lens("bench")', 'lens("bench2")'));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(b.remounts.length, 1);
  assert.match(b.remounts[0], /parts or wires changed/);
  const bad = await b.editor.apply(b.editor.text.replace("radius: 12", "radius: 400"));
  assert.equal(bad.ok, false, "a radius past the Grammar's max does not build");
  assert.ok(bad.diagnostics.some((d) => d.severity === "error"));
});

test("a custom element stage's wb-control, wb-param and wb-edit: checked against the declarations, logged, or refused with the kit's code", async () => {
  const b = await lensBench();
  const s = b.session;
  const c = s.element("wb-control", { control: "nope", value: { value: 1 } });
  assert.deepEqual(c.map((d) => d.code), ["N013"], "a Control the page lacks");
  assert.deepEqual(s.element("wb-param", { param: "focus", value: 7, phase: "preview" }), []);
  assert.deepEqual(s.page.run.log.inputs.filter((e) => e.kind === "param").map((e) => [e.name, e.value]), [["focus", 7]], "a preview is a logged param input");
  assert.deepEqual(b.commits, [], "a preview commits nothing");
  assert.deepEqual(s.element("wb-param", { param: "focus", value: 8, phase: "commit" }), []);
  assert.deepEqual(b.commits.at(-1), { part: "bench", to: "param.focus", value: 8 });
  await settle(); await settle();
  assert.match(b.editor.text, /param\("focus", \{ value: 8, min: 0, max: 10 \}\)/, "the param's declared value is written back");
  assert.deepEqual(s.element("wb-param", { param: "blur", value: 1 }).map((d) => d.code), ["H011"], "a param the Program does not declare");
  assert.deepEqual(s.element("wb-param", { param: "focus", value: 99 }).map((d) => d.code), ["N008"], "a value outside the declaration is the run's refusal");

  const n = b.rebuilds().length;
  assert.deepEqual(s.element("wb-edit", { to: "arg.bench.lens#1:0.radius", value: 30, phase: "preview" }), []);
  b.f.tick(32);
  assert.equal(b.rebuilds().length, n + 1, "the preview is one logged rebuild a frame");
  assert.equal(b.rebuilds().at(-1).record.lens[1].radius, 30);
  assert.deepEqual(s.element("wb-edit", { to: "arg.bench.lens#1:0.radius", value: 31, phase: "commit" }), []);
  assert.deepEqual(b.commits.at(-1), { part: "bench", to: "arg.bench.lens#1:0.radius", value: 31 });
  assert.deepEqual(s.element("wb-edit", { to: "arg.bench.lens#7:0.radius", value: 3 }).map((d) => d.code), ["H011"], "no call is at that address");
  assert.deepEqual(s.element("wb-edit", { to: "lens.radius", value: 3 }).map((d) => d.code), ["H011"], "not a target");
  assert.deepEqual(s.element("wb-edit", { to: "arg.bench.lens#1:0.radius", value: 400, phase: "commit" }).map((d) => d.code), ["H012"], "a value the Grammar refuses does not build");
});

test("yJU9zy. a second and a third Grip release each write back: the run keeps the record of the text it was built from (kit/run, a same-key rebuild)", async () => {
  const b = await lensBench();
  const s = b.session;
  let T = 32;
  for (const [from, to, r] of [[42, 47, 17], [47, 50, 20], [50, 51, 21]]) {
    const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, from, 40);
    drag.move(to, 40);
    b.f.tick(T); T += 16;
    drag.release();
    await settle(); await settle();
    b.f.tick(T); T += 16;
    assert.deepEqual(b.said, [], `release to ${r} wrote`);
    assert.match(b.editor.text, new RegExp(`radius: ${r}, at: \\[30, 40\\]`));
    assert.equal(s.recordOf("bench"), s.page.run.composed.parts.find((p) => p.name === "bench").record, "the session reads the run's record");
    assert.equal(s.grips().find((g) => g.grip === "radius" && g.index === 0).disabled, null, "the Grip stays enabled");
  }
});
