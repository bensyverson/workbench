// The red test proto-members.test.js lacks for globals, vectors and conversions: its case stops at the builder's
// B008, so lowering's own-key lookups (expr.js identifier, assign.js writableLocal, numeric.js own) are untested.
// Through lowerProgram (no builder), a prototype name must be an ordinary undeclared name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "./fixture.js";
import { lowerProgram } from "../index.js";

const run = (/** @type {string} */ src) => lowerProgram(environment, [{ src, slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } }]).results[0].diagnostics.map((d) => `${d.code} ${d.message}`);

for (const m of ["valueOf", "hasOwnProperty", "isPrototypeOf"]) {
  test(`'${m}' read, called or assigned is one ordinary diagnostic`, () => {
    for (const src of [`(self, w) => { w.next = ${m}; }`, `(self, w) => { w.next = ${m}(1); }`]) {
      const out = run(src);
      assert.equal(out.length, 1, `${src}\n${out.join("\n")}`);
      assert.match(out[0], /^L001 /, src);
    }
  });
}
