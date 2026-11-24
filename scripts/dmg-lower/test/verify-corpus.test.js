// Every kernel the M1 pipeline lowers, from every DMG preset, passes the IR verifier
// strictly (as a finished program's kernels: no `unknown` left), as do the IR goldens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadDmg } from "../../dmg-oracle/load.js";
import { lowerPreset } from "../pipeline.js";
import { verify } from "../../../kit/ir/verify.js";

const dmg = loadDmg();
const GOLDEN = new URL("./golden/", import.meta.url);

test("every IR golden verifies clean", () => {
  const files = readdirSync(GOLDEN).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 2);
  for (const f of files) assert.deepEqual(verify(JSON.parse(readFileSync(new URL(f, GOLDEN), "utf8"))), [], f);
});

test("every lambda and helper the survey lowers, in every preset, verifies clean", () => {
  /** @type {Set<string>} */
  const lowered = new Set();
  /** @type {Set<string>} */
  const failed = new Set();
  let helpers = 0;
  for (const p of dmg.presets) {
    const { entries, helpers: hs } = lowerPreset(dmg, p.id);
    for (const e of entries) {
      const key = `${p.id} ${e.slot.id}`;
      if (!e.result.kernel) { failed.add(key); continue; }
      lowered.add(key);
      assert.deepEqual(verify(e.result.kernel), [], `${key} (${e.ref.id})`);
    }
    for (const h of hs) {
      if (!h.result.kernel) continue;
      helpers++;
      assert.deepEqual(verify(h.result.kernel), [], `${p.id} helper ${h.name}`);
    }
  }
  // The survey counts a fragment lambda once, lowered only when every part lowers it.
  for (const k of failed) lowered.delete(k);
  assert.equal(lowered.size, 111, "the survey's lowered count (scripts/dmg-diff/README.md)");
  assert.ok(helpers > 0, "some preset's helpers lower, so their kernels are verified too");
});
