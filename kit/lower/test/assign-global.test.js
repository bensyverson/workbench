// Trial 4 (2026-11-25): an assignment to a Dialect global (`$ = 1`, `Math = 1`) lowered clean and the
// statement vanished from the Kernel: writableLocal resolved the name as a read, which reports nothing for a
// global, and returned null. A global is read-only, so each form is L013 and no Kernel is made.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";

/** @import { Environment } from "../environment.js" */

/** @type {Environment} */
const env = {
  name: "assign-global (test)",
  objects: { G: { label: "the params ($)", members: { k: { kind: "value", t: "f64" } } } },
  list: {},
  queries: [],
  globals: { $: { obj: "G" } },
  slot: () => ({ params: ["f64"], returns: "f64", space: "pixel", forbid: [] }),
};
const ref = { id: "p", kind: "pixel", on: "t" };

for (const body of ["$ = 1;", "$ += 1;", "$++;", "let y = 0; y = $ = 1;"]) {
  test(`an assignment to a global is L013: ${body}`, () => {
    const r = lowerLambda(env, `(x) => { ${body} return x; }`, ref);
    assert.equal(r.kernel, null);
    const codes = r.diagnostics.map((d) => d.code);
    assert.ok(codes.includes("L013"), codes.join(","));
    assert.match(r.diagnostics.find((d) => d.code === "L013")?.message ?? "", /'\$' is a global/);
  });
}
