// run() lets a host's bad param value (checkValue's TypeError) through whatever build-time code does with it: caught it, caught a B003 too, or wrapped it.
// @ts-nocheck
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import { program } from "../../dialects/data/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };
const base = () => program("q").source("sales", SALES).param("n", { value: 3, min: 1, max: 5 }).table("t", "sales");

test("a host value that does not fit throws TypeError though build-time code caught both it and a B003", () => {
  const fn = ($) => {
    const b = base();
    try { void $.m; } catch { /* fall back */ }
    let n = 2;
    try { n = $.n; } catch { /* fall back */ }
    return b.limit(n);
  };
  assert.throws(() => run(fn, { values: { n: 99 } }), TypeError);
});

test("the host's TypeError, not the Program's knock-on error, is what surfaces", () => {
  const fn = ($) => { const b = base(); let n; try { n = $.n; } catch { /* */ } return b.limit(n.valueOf()); };
  assert.throws(() => run(fn, { values: { n: 99 } }), /run\(\{ values \}\): 'n'/);
});

test("a host TypeError rethrown wrapped by build-time code after a caught B003 still surfaces as the host's", () => {
  const fn = ($) => {
    const b = base();
    try { void $.m; } catch { /* */ }
    try { return b.limit($.n); } catch (e) { throw new Error("wrapped", { cause: e }); }
  };
  assert.throws(() => run(fn, { values: { n: 99 } }), TypeError);
});
