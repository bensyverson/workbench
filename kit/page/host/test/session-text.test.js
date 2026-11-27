// @ts-nocheck: page and run objects are generated, which TypeScript cannot follow here.
// The Program's text is the source of truth, and the record in force follows it at once (reviewer-79, issues qgtpNs
// and vXxknp; the integrator's rulings of 2026-11-27 in project/2026-11-27-controls-draft.md, requirement 8): a
// release, an undo and an Apply are in force before the next frame, running or paused; a drag previews while paused;
// a Grip disabled for a moment leaves no lasting warning; a scrub, a seek or a rewind is a branch of the run, not of the
// text, so when the record in force is no longer the text's the session puts the text in force again at the new T.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readPackageDir } from "../../../../scripts/pkg/dir.js";
import { loadPreset, reloadText } from "../load.js";
import { createSession } from "../session.js";
import { createEditor, rebuildWith } from "../editor.js";
import { createInputDevices, GESTURE_IDLE_MS } from "../input-devices.js";
import { hashText } from "../../../package/index.js";
import { fakeContext, frames } from "../../fixtures/bench.js";

const kit = (p) => new URL(`../../../${p}`, import.meta.url).href;
const env = {
  urls: { define: kit("define/index.js"), compose: kit("compose/index.js") },
  makeUrl: (text) => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`,
  importUrl: (url) => import(url),
};
const LENS = readPackageDir(fileURLToPath(new URL("../../../../examples/lens", import.meta.url)));

/** The lens bench as the page runs it, with an editor whose commits write back (as session-stage.test.js's). */
async function lensBench(more = {}) {
  const loaded = await loadPreset({ packages: { lens: LENS }, package: "lens", example: "examples/bench.js" }, env);
  const f = frames();
  const said = [];
  const current = { loaded, session: null };
  let editor = null;
  current.session = createSession(loaded, {
    context: fakeContext(), requestFrame: f.requestFrame, ...more,
    onCommit: (c) => { editor.write(c).then((r) => { if (!r.ok) said.push(...r.diagnostics); }); },
  });
  editor = createEditor({
    text: loaded.source,
    recordOf: (part) => current.session.recordOf(part),
    inForce: () => current.session.textInForce(),
    rebuild: rebuildWith({ reload: (t) => reloadText(current.loaded, t, env), current: () => current, remount: (next) => { current.loaded = next; } }),
  });
  current.session.start(); f.tick(0); f.tick(16);
  return { session: current.session, f, editor, said, rebuilds: () => current.session.page.run.log.inputs.filter((e) => e.kind === "rebuild") };
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
/** The first lens's radius in a text. @param {string} t */
const radiusIn = (t) => Number(/radius: (\d+), at: \[30, 40\]/.exec(t)[1]);
const radiusInForce = (s) => s.recordOf("bench").lens[0].radius;
const disabledWarnings = (s) => s.page.status().page.filter((d) => /drawn disabled/.test(d.message)).map((d) => d.message);
const allEnabled = (s) => s.grips().every((g) => g.disabled === null);

test("a release is in force at once: before the next frame the record is the text's, every Grip is enabled and nothing is listed", async () => {
  const b = await lensBench();
  const s = b.session;
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 40);
  b.f.tick(32);
  drag.release();
  await settle();
  assert.deepEqual(b.said, []);
  assert.equal(radiusIn(b.editor.text), 17);
  assert.equal(radiusInForce(s), 17, "the record in force is the new text's");
  assert.equal(s.textInForce(), true);
  assert.equal(allEnabled(s), true, JSON.stringify(s.grips().map((g) => g.disabled)));
  assert.deepEqual(s.page.status().page.filter((d) => d.code === "H012"), []);
  assert.deepEqual(disabledWarnings(s), []);
});

test("paused: a drag previews at once, its release is in force at once, and an undo puts the previous text in force and redraws", async () => {
  const b = await lensBench();
  const s = b.session;
  s.pause();
  const before = JSON.stringify(s.page.draw().list);
  const T0 = s.page.run.seconds;
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 40);
  b.f.tick(32);
  assert.equal(radiusInForce(s), 17, "the preview shows while paused");
  assert.notEqual(JSON.stringify(s.page.draw().list), before, "and the picture follows it");
  drag.release();
  await settle();
  b.f.tick(48);
  assert.deepEqual(b.said, []);
  assert.equal(radiusIn(b.editor.text), 17);
  assert.equal(radiusInForce(s), 17);
  assert.equal(allEnabled(s), true);
  assert.equal(s.page.status().paused, true, "still paused");
  assert.ok(s.page.run.seconds - T0 <= 0.001 + 1e-9, "the run moved at most a millisecond");
  const r = await b.editor.undo();
  assert.equal(r.ok, true);
  assert.equal(radiusIn(b.editor.text), 12);
  assert.equal(radiusInForce(s), 12, "the undo is in force while paused");
  assert.equal(JSON.stringify(s.page.draw().list), before, "and the picture is the first one again");
  assert.equal(allEnabled(s), true);
});

test("a Grip disabled for a moment (the record in force not the text's) leaves no lasting warning once it is enabled again", async () => {
  const b = await lensBench();
  const s = b.session;
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 40);
  b.f.tick(32);
  assert.equal(allEnabled(s), true, "a preview's record keeps the text's call: the other Grips stay enabled during a drag");
  drag.release();
  await settle();
  // the run's own rewind, past the session: the record of the text before, so the call's Grips are disabled (H012)
  s.page.run.rewind(0.02);
  assert.equal(s.grips().find((g) => g.grip === "radius" && g.index === 0).disabled?.code, "H012");
  assert.equal(disabledWarnings(s).length, 2, "said while they are: the rim and the center of the first lens");
  assert.equal((await b.editor.apply(b.editor.text)).ok, true);
  assert.equal(allEnabled(s), true);
  assert.deepEqual(disabledWarnings(s), [], "a disable that ended is not listed");
  // a lasting one still is: a computed argument
  const text = b.editor.text.replace("radius: 20, at: [65, 60]", "radius: 4 * 5, at: [65, 60]");
  assert.equal((await b.editor.apply(text)).ok, true);
  assert.equal(s.grips().find((g) => g.grip === "radius" && g.index === 1).disabled?.code, "H011");
  assert.equal(disabledWarnings(s).length, 1, "the rim of the second lens (its center is a literal)");
});

test("a scrub back past a release puts the text in force again at the new T: the record agrees with the text and the Grips stay enabled", async () => {
  const b = await lensBench();
  const s = b.session;
  let T = 32;
  for (let i = 0; i < 6; i++) { b.f.tick(T); T += 16; }
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 40);
  b.f.tick(T); T += 16;
  drag.release();
  await settle();
  for (let i = 0; i < 4; i++) { b.f.tick(T); T += 16; }
  const n = b.rebuilds().length;
  s.scrub(0.02);
  assert.equal(radiusIn(b.editor.text), 17, "the text is unchanged: a rewind is a branch of the run");
  assert.equal(radiusInForce(s), 17, "the text is in force again");
  assert.equal(b.rebuilds().length, n - 2 + 1, "the branch drops the preview and the release, and logs one rebuild of the text");
  // the bench is a demand part, whose last instant was at 0, so the rebuild is stamped at the scrub's T itself
  assert.equal(b.rebuilds().at(-1).T, "1/50", "at the scrub's T");
  assert.equal(allEnabled(s), true);
  s.resume();
  for (let i = 0; i < 10; i++) { b.f.tick(T); T += 16; }
  assert.equal(radiusInForce(s), 17);
  assert.equal(allEnabled(s), true);
  // a scrub with the text in force logs nothing
  const m = b.rebuilds().length;
  s.scrub(0.1);
  assert.equal(b.rebuilds().length, m);
  assert.equal(radiusInForce(s), 17);
  // a seek forward on the branch agrees too
  s.seek(0.3);
  assert.equal(radiusInForce(s), 17);
  assert.equal(b.rebuilds().length, m);
});

test("Apply of the unchanged text rebuilds when the record in force is not the text's, and is a no-op when it is", async () => {
  const b = await lensBench();
  const s = b.session;
  const drag = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  drag.move(47, 40);
  b.f.tick(32);
  drag.release();
  await settle();
  b.f.tick(48);
  const n = b.rebuilds().length;
  const same = await b.editor.apply(b.editor.text);
  assert.deepEqual(same, { ok: true, text: b.editor.text, changed: false }, "the text is in force: nothing to do");
  assert.equal(b.rebuilds().length, n);
  // a rewind made past the session (the run's own), to before the drag, leaves the record of the text before
  s.page.run.rewind(0.01);
  assert.equal(radiusInForce(s), 12);
  assert.equal(s.textInForce(), false);
  const r = await b.editor.apply(b.editor.text);
  assert.equal(r.ok, true);
  assert.equal(radiusInForce(s), 17, "the text is in force again");
  assert.equal(s.textInForce(), true);
  assert.equal(b.editor.canRedo, false);
});

test("two releases in one frame each write back: the second finds the first's record in force (the README's old limit)", async () => {
  const b = await lensBench();
  const s = b.session;
  const one = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  one.move(47, 40);
  b.f.tick(32);
  one.release();
  await settle();
  // no frame between: the second drag's only move is flushed by its release
  const two = s.grab({ part: "bench", grip: "radius", index: 1 }, 85, 60);
  two.move(88, 60);
  two.release();
  await settle();
  b.f.tick(48);
  assert.deepEqual(b.said, []);
  assert.match(b.editor.text, /radius: 17, at: \[30, 40\]/);
  assert.match(b.editor.text, /radius: 23, at: \[65, 60\]/);
  assert.equal(s.recordOf("bench").lens[1].radius, 23);
  assert.equal(s.textInForce(), true, "and still after the next frame: no preview of the drag lands after its write-back");
  assert.equal(allEnabled(s), true);
});

test("a MIDI knob on a part-local Control with to: its messages preview, and the gesture's end is one commit, one write-back and one undo step", async () => {
  const files = { ...LENS };
  files["lens.ui.js"] = String(files["lens.ui.js"]).replace("  tiles:", '  controls: { focus: { kind: "number", min: 0, max: 10, value: 5, to: "param.focus", midi: { cc: 74 } } },\n  tiles:');
  const manifest = JSON.parse(String(files["wb-package.json"]));
  manifest.files["lens.ui.js"] = await hashText(files["lens.ui.js"]);
  files["wb-package.json"] = JSON.stringify(manifest, null, 2);
  const loaded = await loadPreset({ packages: { lens: files }, package: "lens", example: "examples/bench.js" }, env);
  assert.deepEqual(loaded.diagnostics.filter((d) => d.severity === "error"), []);
  const f = frames(), poll = frames();
  const writes = [];
  const current = { loaded, session: null };
  let editor = null;
  current.session = createSession(loaded, { context: fakeContext(), requestFrame: f.requestFrame, onCommit: (c) => writes.push(editor.write(c)) });
  editor = createEditor({ text: loaded.source, recordOf: (p) => current.session.recordOf(p), inForce: () => current.session.textInForce(), rebuild: rebuildWith({ reload: (t) => reloadText(current.loaded, t, env), current: () => current, remount: () => {} }) });
  const s = current.session;
  s.start(); f.tick(0); f.tick(16);
  if (s.page.locked) s.page.unlock();
  const d = createInputDevices({ forms: () => s.forms(), control: (n, r, e) => s.control(n, r, e), navigator: {}, requestFrame: poll.requestFrame, report: () => {}, locked: () => s.page.locked });
  let T = 32;
  for (const v of [70, 80, 90, 100, 110]) { d.message([0xb0, 74, v], T - 8); f.tick(T); poll.tick(T); T += 16; }
  assert.equal(writes.length, 0, "no write while the knob turns");
  assert.ok(s.page.run.params("bench").focus > 5, "the knob previews");
  poll.tick(T - 16 - 8 + GESTURE_IDLE_MS);
  assert.equal(writes.length, 1, "one commit when it rests");
  const r = await writes[0];
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(editor.text, /param\("focus", \{ value: 8\.66/);
  let undos = 0;
  while (editor.canUndo) { await editor.undo(); undos++; }
  assert.equal(undos, 1, "one undo step");
});

// issue APskkG L3 (reviewer-79): a custom element's preview that fails to build at the frame is listed under its kit code
test("a wb-edit preview that does not build is one H012 for the stage, with its own code, not a LOAD problem", async () => {
  const staged = [], problems = [];
  const b = await lensBench({ onStage: (ds) => staged.push(...ds), onProblem: (m) => problems.push(m) });
  const s = b.session;
  assert.deepEqual(s.element("wb-edit", { to: "arg.bench.lens#1:0.radius", value: 400, phase: "preview" }), [], "a preview is checked when it is built");
  b.f.tick(32);
  b.f.tick(48);
  assert.deepEqual(problems, []);
  assert.deepEqual(staged.map((d) => [d.code, d.severity]), [["H012", "error"]], "said once, under its own code");
  assert.match(staged[0].message, /does not build/);
});

test("two releases on one call in one frame each write back (a lens's rim, then its center)", async () => {
  const b = await lensBench();
  const s = b.session;
  const rim = s.grab({ part: "bench", grip: "radius", index: 0 }, 42, 40);
  rim.move(47, 40);
  rim.release();
  await settle();
  const center = s.grab({ part: "bench", grip: "move", index: 0 }, 30, 40);
  center.move(35, 40);
  center.release();
  await settle();
  b.f.tick(32);
  assert.deepEqual(b.said, []);
  assert.match(b.editor.text, /\.lens\(\{ radius: 17, at: \[35, 40\] \}\)/);
  assert.equal(s.textInForce(), true);
  assert.equal(allEnabled(s), true);
});

test("paused, a param edit (the params panel, a custom element's wb-param preview) is in force at once; running, at the run's next instant", async () => {
  const b = await lensBench();
  const s = b.session;
  assert.deepEqual(s.setParam("bench", "focus", 6), []);
  assert.equal(s.page.run.params("bench").focus, 5, "running: logged for the run's next instant");
  b.f.tick(32); b.f.tick(48);
  assert.equal(s.page.run.params("bench").focus, 6);
  s.pause();
  assert.deepEqual(s.setParam("bench", "focus", 7), []);
  assert.equal(s.page.run.params("bench").focus, 7, "paused: at once");
  assert.deepEqual(s.element("wb-param", { param: "focus", value: 8, phase: "preview" }), []);
  assert.equal(s.page.run.params("bench").focus, 8);
  assert.deepEqual(s.setParam("bench", "focus", 99).map((d) => d.code), ["N008"], "a refusal is still the run's");
  assert.equal(s.page.run.params("bench").focus, 8);
});
