// @ts-nocheck: records are generated, which TypeScript cannot follow here.
// Actions (project/2026-11-27-controls-draft.md, requirement 11; build plan group 50): `runAction` calls the function
// the host imported with { record, state, params, files, signal, progress, pause }, checks what it gives, applies an
// edits result as one write-back and one undo step, and is cancelled by its signal. An optimizer's new design.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runAction, createHistory } from "../index.js";
import { run } from "../../define/index.js";
import { HERE } from "../fixtures/synth-program.js";

const TEXT = `import { g } from "${HERE}";\nexport default ($) => g("s").op("a", { ratio: 2, level: 0.5 });\n`;
const fn = async () => (await import(`data:text/javascript;base64,${Buffer.from(TEXT).toString("base64")}`)).default;
const base = async () => ({ record: run(await fn()).record, state: { voices: 1 }, params: {}, files: { glasses: [{ name: "BK7" }] } });

test("50. runAction: a file's shape is checked, a bad shape or a throw is H013; edits are one write-back and one step; signal, progress, pause", async () => {
  const ctx = await base();
  const file = await runAction(async (c) => ({ name: "lens.zmx", type: "text/plain", bytes: new TextEncoder().encode(c.files.glasses[0].name) }), { ...ctx, gives: "file" });
  assert.equal(file.ok, true);
  assert.equal(new TextDecoder().decode(file.file.bytes), "BK7");
  const bad = await runAction(async () => ({ name: "x", bytes: "not bytes" }), { ...ctx, gives: "file" });
  assert.deepEqual([bad.ok, bad.code], [false, "H013"]);
  const threw = await runAction(async () => { throw new Error("diverged"); }, { ...ctx, gives: "file" });
  assert.deepEqual([threw.ok, threw.code], [false, "H013"]);
  assert.match(threw.message, /diverged/);

  const history = createHistory(TEXT);
  const edits = await runAction(async () => [{ to: "arg.s.op#0:1.ratio", value: 3 }, { to: "arg.s.op#0:1.level", value: 0.25 }], { ...ctx, gives: "edits", history });
  assert.equal(edits.ok, true, edits.message);
  assert.ok(history.text.includes(`{ ratio: 3, level: 0.25 }`));
  assert.equal(history.undo(), TEXT, "one undo step for the whole result");
  const wrong = await runAction(async () => [{ to: 3 }], { ...ctx, gives: "edits", history: createHistory(TEXT) });
  assert.equal(wrong.code, "H013");
  const kept = createHistory(TEXT);
  const overlap = await runAction(async () => [{ to: "arg.s.op#0:1.ratio", value: 3 }, { to: "arg.s.op#0:1.ratio", value: 4 }], { ...ctx, gives: "edits", history: kept });
  assert.deepEqual([overlap.ok, overlap.code], [false, "H013"], "an action whose edits overlap gave the wrong shape");
  assert.match(overlap.message, /overlap/);
  assert.equal(kept.text, TEXT, "nothing is kept");
  assert.equal(kept.canUndo, false);

  const abort = new AbortController();
  /** @type {number[]} */
  const seen = [];
  let slices = 0;
  const long = runAction(async ({ signal, progress, pause }) => {
    for (let i = 0; i < 1000; i++) { if (signal.aborted) return null; progress(i / 1000); slices++; await pause(); }
    return [];
  }, { ...ctx, gives: "edits", history: createHistory(TEXT), onProgress: (f) => seen.push(f) });
  void long;
  const cancelled = runAction(async ({ signal, pause }) => { while (!signal.aborted) await pause(); return []; }, { ...ctx, gives: "edits", history: createHistory(TEXT), signal: abort.signal });
  await new Promise((r) => setTimeout(r, 5));
  abort.abort();
  const c = await cancelled;
  assert.deepEqual([c.ok, c.cancelled], [false, true]);
  await long;
  assert.ok(seen.length > 0, "progress is reported");
  assert.equal(slices, 1000, "pause gives the thread back and resumes");
});
