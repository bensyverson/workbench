import { test } from "node:test";
import assert from "node:assert/strict";
import { main, describeCase } from "../cli.js";
import { standardCases, runCase } from "../../../kit/harness/index.js";

test("a case that overrides the figure says so, with its reason, in the report", async () => {
  const c = { ...standardCases(0.1)[0], override: { figure: 1e-2, reason: "measured 5e-3 on one GPU" } };
  const r = await runCase(c);
  assert.match(describeCase(r, c, 1e-2).join("\n"), /GLSL figure overridden to 0\.01 for this case: measured 5e-3 on one GPU/);
  const plain = standardCases(0.1)[0];
  assert.doesNotMatch(describeCase(await runCase(plain), plain, 1e-3).join("\n"), /overridden/);
});

test("stress --no-glsl prints the stress case's override and reason", async () => {
  /** @type {string[]} */
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { assert.equal(await main(["stress", "--no-glsl", "--scale", "0.1"]), 0); } finally { console.log = log; }
  assert.match(lines.join("\n"), /GLSL figure overridden to 0\.01 for this case: .*5\.18e-3/);
});
