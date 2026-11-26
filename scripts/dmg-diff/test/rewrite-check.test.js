import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg, maintainedPresets, originalPresets } from "../../dmg-oracle/load.js";
import { changedPresets, compareRewrites } from "../rewrite-check.js";

const original = originalPresets();

test("the maintained presets differ from the archived originals only in the rewritten ones, and keep every id and field but code", () => {
  const maintained = maintainedPresets();
  assert.deepEqual(maintained.map((p) => p.id), original.map((p) => p.id));
  for (const [i, m] of maintained.entries()) assert.deepEqual({ ...m, code: "" }, { ...original[i], code: "" }, `preset ${m.id}`);
  assert.deepEqual(changedPresets(original, maintained), ["04", "05", "06", "07", "10", "11", "12", "13", "14", "21", "22", "23", "24"]);
});

test("a rewrite that keeps the behavior leaves the trace unchanged", () => {
  const dmg = loadDmg();
  const { runs } = compareRewrites({ ...dmg, presets: dmg.presets.filter((p) => p.id === "05") }, original, { seeds: [7], frames: 400 });
  assert.ok(runs.length > 0);
  assert.ok(runs.every((r) => r.diff === null && r.ticks === 400), JSON.stringify(runs.filter((r) => r.diff)));
});

test("a rewrite that changes the behavior is caught", () => {
  const dmg = loadDmg();
  const planted = maintainedPresets().map((p) => (p.id === "05" ? { ...p, code: p.code.replace("if (self.rise !== 0) self.rise--;", "if (self.rise === 0) self.rise--;") } : p));
  assert.notEqual(planted.find((p) => p.id === "05")?.code, dmg.preset("05").code, "the planted edit is in the program");
  const { runs } = compareRewrites(loadDmg(undefined, planted), original, { seeds: [7], frames: 400 });
  assert.ok(runs.some((r) => r.preset === "05" && r.diff), "the planted fault shows in a trace");
});
