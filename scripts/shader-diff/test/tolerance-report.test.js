// When --tolerance replaces a case's override, the report says which figure was used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, describeCase, overrideLine } from "../cli.js";
import { standardCases, runCase } from "../../../kit/harness/index.js";

/** @param {string[]} argv */
async function capture(argv) {
  /** @type {string[]} */
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { await main(argv); } finally { console.log = log; }
  return lines.join("\n");
}

test("a case report says it was held to the caller's figure, not its override's", async () => {
  const c = { ...standardCases(0.1)[0], override: { figure: 1e-2, reason: "measured 5e-3" } };
  const r = await runCase(c, { tolerance: 0.5 });
  const text = describeCase(r, c, r.tolerance).join("\n");
  assert.match(text, /GLSL figure overridden to 0\.01 for this case: measured 5e-3; held to 0\.5 by --tolerance/);
  const own = describeCase(await runCase(c), c, 1e-2).join("\n");
  assert.doesNotMatch(own, /--tolerance/);
});

test("stress --tolerance reports the figure it used beside the override", async () => {
  const out = await capture(["stress", "--no-glsl", "--scale", "0.1", "--tolerance", "0.5"]);
  assert.match(out, /held to 0\.5 by --tolerance/);
});

test("the faults report's override line says which figure held the case", () => {
  const o = { case: "x", figure: 1e-2, reason: "why", held: 1e-2 };
  assert.equal(overrideLine(o), "override: x is held to 0.01: why");
  assert.equal(overrideLine({ ...o, held: 0.5 }), "override: x is held to 0.5 by --tolerance (its override is 0.01): why");
});
