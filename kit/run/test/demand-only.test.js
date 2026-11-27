// A run whose every stepping part is on a demand clock makes no instant past the first (kit/run's "Not here": a
// workbench of demand parts only), so it is played and nothing happens. It says so at createRun (N014, a warning),
// never silently (the tests rerun, issue qsEYlW: two blind game authors lost a check each to it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../index.js";
import { compose } from "../../compose/index.js";
import { ticker } from "./helpers.js";

test("a run of demand parts only warns N014 at createRun, naming them", () => {
  const a = ticker("seq", { demand: true });
  const run = createRun(compose("solo").part(a.part).build({ runtimes: [a.runtime] }), { runtimes: [a.runtime] });
  const n = run.diagnostics.filter((d) => d.code === "N014");
  assert.equal(n.length, 1);
  assert.equal(n[0].severity, "warning");
  assert.match(n[0].message, /seqx/);
});

test("a demand part beside a clocked one is not warned", () => {
  const a = ticker("seq", { demand: true }), b = ticker("beat", { tick: 1 / 4 });
  const run = createRun(compose("two").part(a.part).part(b.part).build({ runtimes: [a.runtime, b.runtime] }), { runtimes: [a.runtime, b.runtime] });
  assert.equal(run.diagnostics.some((d) => d.code === "N014"), false);
});
