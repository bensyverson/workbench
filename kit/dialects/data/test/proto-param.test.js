// The data Dialect's environment hook builds $'s members with `members[n] = …`, so a param named __proto__
// (which fields explicitly allows, with defineProperty) is silently dropped: reading it is a false L002.
import { test } from "node:test";
import assert from "node:assert/strict";
import { program } from "../index.js";

const base = (/** @type {string} */ p) => program("f")
  .source("sales", { csv: "s.csv", columns: { units: "f64" } })
  .param(p, { min: 0, max: 500, step: 10, value: 50 })
  .table("picked", "sales")
  .filter(`(row) => row.units >= $.${p}`);

const codes = (/** @type {any} */ b) => {
  const c = b.check();
  if (c.length) return c.map((/** @type {any} */ d) => `${d.code} ${d.message}`);
  return program.lower(b.build()).diagnostics.map((/** @type {any} */ d) => `${d.code} ${d.message}`);
};

test("control: an ordinary param lowers", () => assert.deepEqual(codes(base("minUnits")), []));
for (const p of ["constructor", "toString", "__proto__"]) {
  test(`a param named ${p} is either refused at build or lowers`, () => {
    const out = codes(base(p));
    assert.ok(out.length === 0 || out.every((/** @type {string} */ d) => d.startsWith("B")), out.join("\n"));
  });
}
