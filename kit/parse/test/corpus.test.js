// The parser against the real corpus: every runtime lambda in the DMG presets,
// from the oracle's inventory. Test-only use of scripts/; kit code never imports it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda, checkSubset } from "../index.js";
import { inventory } from "../../../scripts/dmg-oracle/inventory.js";

const inv = inventory();
const M1 = new Set(["04", "05", "06", "07"]);

test("every runtime lambda in presets 04–07 parses and is inside the subset", () => {
  const m1 = inv.filter((e) => M1.has(e.preset));
  assert.equal(m1.length, 25);
  for (const e of m1) {
    const r = parseLambda(e.src);
    assert.ok(r.ok, `${e.preset} ${e.id}: ${r.diagnostics.map((d) => d.message).join("; ")}`);
    const ds = checkSubset(r.ast, e.src).filter((d) => d.severity === "error");
    assert.deepEqual(ds.map((d) => d.code), [], `${e.preset} ${e.id}`);
  }
});

test("every runtime lambda in all presets parses, or fails with a coded diagnostic naming the construct", () => {
  for (const e of inv) {
    const r = parseLambda(e.src);
    if (r.ok) continue;
    for (const d of r.diagnostics) assert.match(d.code, /^P00[1-5]$/, `${e.preset} ${e.id}`);
  }
});

test("spans in corpus ASTs slice back to their own source text", () => {
  for (const e of inv.filter((x) => M1.has(x.preset))) {
    const r = parseLambda(e.src);
    assert.ok(r.ok);
    assert.equal(e.src.slice(r.ast.range[0], r.ast.range[1]), e.src.trim());
    const body = r.ast.body;
    assert.ok(e.src.slice(body.range[0], body.range[1]).length > 0);
  }
});
