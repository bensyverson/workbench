// Lowering every runtime lambda of presets 04–07 against the DMG dialect, and the
// checked-in IR goldens for preset 04.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadDmg } from "../../dmg-oracle/load.js";
import { lowerPreset } from "../pipeline.js";
import { printKernel, formatJSON } from "../../../kit/ir/index.js";

const dmg = loadDmg();
const M1 = ["04", "05", "06", "07"];
const GOLDEN = new URL("./golden/", import.meta.url);
/** Set UPDATE_GOLDEN=1 to rewrite the goldens after a deliberate IR change; review the diff. */
const UPDATE = process.env.UPDATE_GOLDEN === "1";

test("every runtime lambda in presets 04–07 lowers to a kernel", () => {
  let n = 0;
  for (const id of M1) {
    for (const e of lowerPreset(dmg, id).entries) {
      n++;
      const errors = e.result.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`);
      assert.deepEqual(errors, [], `${id} ${e.slot.id}`);
      assert.ok(e.result.kernel, `${id} ${e.slot.id}`);
    }
  }
  assert.equal(n, 25);
});

test("the program's inferred signatures: whack returns bool, award takes f64, payloads from emits", () => {
  const { sigs } = lowerPreset(dmg, "06");
  assert.equal(sigs.methods["Mole.whack"].returns, "bool");
  assert.deepEqual(sigs.methods["World.award"].params, ["f64"]);
  assert.deepEqual(sigs.events.whack, { struct: { cell: "f64" } });
  assert.deepEqual(lowerPreset(dmg, "07").sigs.events.burst, { struct: { x: "f64", y: "f64" } });
});

for (const [slot, file] of [["Mole.onFrame#0", "04-mole-onframe"], ["timer(spawn)", "04-timer-spawn"]]) {
  test(`preset 04 ${slot} matches its IR golden (JSON and listing)`, () => {
    const e = lowerPreset(dmg, "04").entries.find((x) => x.slot.id === slot);
    assert.ok(e?.result.kernel);
    const json = formatJSON(e.result.kernel);
    const text = printKernel(e.result.kernel);
    const jsonUrl = new URL(`${file}.json`, GOLDEN), textUrl = new URL(`${file}.txt`, GOLDEN);
    if (UPDATE) { writeFileSync(jsonUrl, json); writeFileSync(textUrl, text); }
    assert.equal(json, readFileSync(jsonUrl, "utf8"));
    assert.equal(text, readFileSync(textUrl, "utf8"));
  });
}
