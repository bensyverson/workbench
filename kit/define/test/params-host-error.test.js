// Review of c2845ca: run()'s refusal bookkeeping. A host's mistake (a value that does not fit) is a TypeError,
// per the README, even when build-time code caught a refusal earlier in the same run.
// @ts-nocheck
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import { program } from "../../dialects/data/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };

test("a host value that does not fit still throws TypeError after a caught B003", () => {
  const fn = ($) => {
    const b = program("q").source("sales", SALES).param("n", { value: 3, min: 1, max: 5 }).table("t", "sales");
    try { void $.m; } catch { /* fall back */ }
    return b.limit($.n);
  };
  assert.throws(() => run(fn, { values: { n: 99 } }), TypeError);
});

test("control: without the caught refusal the same host value throws TypeError", () => {
  const fn = ($) => program("q").source("sales", SALES).param("n", { value: 3, min: 1, max: 5 }).table("t", "sales").limit($.n);
  assert.throws(() => run(fn, { values: { n: 99 } }), TypeError);
});
