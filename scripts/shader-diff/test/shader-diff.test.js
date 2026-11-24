import { test } from "node:test";
import assert from "node:assert/strict";
import { main, describeCase } from "../cli.js";
import { standardCases, runCase, GLSL_TOLERANCE } from "../../../kit/harness/index.js";
import { findSleepy } from "../sleepy.js";

/** Runs the CLI with its console output captured. */
/** @param {string[]} argv */
async function cli(...argv) {
  /** @type {string[]} */
  const lines = [];
  const log = console.log, error = console.error;
  console.log = (...a) => lines.push(a.join(" "));
  console.error = (...a) => lines.push(a.join(" "));
  try { return { code: await main(argv), out: lines.join("\n") }; } finally { console.log = log; console.error = error; }
}

test("help prints the verbs and exits 0; an unknown verb exits 2", async () => {
  const h = await cli("--help");
  assert.equal(h.code, 0);
  assert.match(h.out, /check .*stress .*|faults/s);
  assert.equal((await cli("nope")).code, 2);
});

test("check --no-glsl compares JS alone, says GLSL was skipped, and exits 0", async () => {
  const r = await cli("check", "--no-glsl", "--scale", "0.1");
  assert.equal(r.code, 0);
  assert.match(r.out, /GLSL skipped \(--no-glsl\)/);
  assert.match(r.out, /domain-warp .*9 param sets/);
  assert.match(r.out, /JS vs interp .*identical/);
  assert.doesNotMatch(r.out, /GLSL vs interp/);
});

test("faults --no-glsl runs the JS faults, and exits 0 because every escape has a reason", async () => {
  const r = await cli("faults", "--no-glsl", "--scale", "0.1");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /js: \d+ of \d+ planted faults caught/);
  assert.doesNotMatch(r.out, /UNEXPLAINED/);
});

test("a pair that differs is described with its pixel, set and source line", async () => {
  const c = standardCases(0.1)[0];
  const r = await runCase(c, { plant: { target: "js", text: (t) => t.replace("Math.sin", "Math.cos") } });
  const text = describeCase(r, c, GLSL_TOLERANCE).join("\n");
  assert.match(text, /JS vs interp .*component\(s\) over|worst/);
  assert.match(text, /at pixel \(\d+, \d+\) channel [rgb]/);
  assert.match(text, /pixel came from swirl\.pixel line \d+: /);
});

test("findSleepy answers a path or null, never throws", () => {
  const s = findSleepy();
  assert.ok(s === null || typeof s === "string");
});
