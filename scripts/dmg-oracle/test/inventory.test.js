import { test } from "node:test";
import assert from "node:assert/strict";
import { inventory } from "../inventory.js";

test("inventory covers every preset with runtime lambdas (all but 02, which has none), each with source text", () => {
  const inv = inventory();
  const presets = new Set(inv.map((e) => e.preset));
  assert.equal(presets.size, 21);
  assert.ok(!presets.has("02"));
  for (const e of inv) {
    assert.ok(e.src.length > 0, `${e.preset} ${e.id} has source`);
    assert.ok(e.kind && e.owner && e.usedBy.length, `${e.preset} ${e.id} has kind, owner, usedBy`);
  }
});

test("inventory ids are unique within each preset", () => {
  const seen = new Set();
  for (const e of inventory()) {
    const key = `${e.preset} ${e.id}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});

test("inventory includes known lambdas from presets 04 and 06", () => {
  const keys = new Set(inventory().map((e) => `${e.preset} ${e.id}`));
  for (const k of ["04 Mole.onFrame#0", "04 timer(spawn)", "06 Whackable.method(whack)", "06 done"]) assert.ok(keys.has(k), k);
});
