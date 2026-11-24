// A strict `x !== null` does not narrow (review of 62bec66, job hxjaI2, finding 1). The core itself gives
// undefined for an empty primitive: `find` with no match, an index past a known length, an optional struct key
// read by destructuring. `x !== null` is true for undefined, so narrowing on it let `x + 1` run on undefined
// and return NaN. Only the loose `x != null` / `x == null`, which match both empty values, narrow.
// From the reviewer's probe local/rev-data-probes/narrow-undef.probe.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { run } from "../../interp/run.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";

/** @import { Environment } from "../environment.js" */
/** @import { Kernel } from "../../ir/ir.js" */

/** @type {Environment} */
const environment = {
  name: "strict null checks (test)", objects: {}, list: {}, queries: ["find", "filter", "some", "every", "reduce"], globals: {},
  // (ns: f64[≤8], s: { a: f64, b?: f64 })
  slot: () => ({ params: [{ list: "f64", max: 8 }, { struct: { a: "f64", b: "f64" }, optional: ["b"] }], returns: "infer", space: "row", forbid: [] }),
};
/** @param {string} src */
const lower = (src) => lowerLambda(environment, src, { id: "t.keep", kind: "keep", on: "t" });

const GET = {
  find: "const x = ns.find((n) => n > 5);",
  index: "const x = ns[3];",
  "struct key": "const { b: x } = s;",
};

for (const [what, get] of Object.entries(GET)) {
  test(`x !== null after ${what} does not narrow, and the refusal's tip names x != null`, () => {
    const r = lower(`(ns, s) => { ${get} if (x !== null) return x + 1; return -1; }`);
    const errors = r.diagnostics.filter((d) => d.severity === "error");
    assert.ok(errors.length > 0, `${what}: refused`);
    assert.match(errors.map((d) => d.tip).join("\n"), /x != null/, what);
  });

  test(`x != null after ${what} narrows, and an empty value takes the other branch`, () => {
    const r = lower(`(ns, s) => { ${get} if (x != null) return x + 1; return -1; }`);
    assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), [], what);
    const k = /** @type {Kernel} */ (r.kernel);
    assert.equal(run(k, [[1, 2], { a: 1 }]), -1, `${what}: interpreter`);
    assert.equal(instantiate(emitKernel(k))([1, 2], { a: 1 }), -1, `${what}: emitted JS`);
  });
}

test("comparing a value that is never empty with undefined names undefined, not null", () => {
  const r = lower("(ns, s) => s.a === undefined");
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"]);
  assert.match(r.diagnostics[0].message, /undefined/);
  assert.doesNotMatch(r.diagnostics[0].message, /null/);
  assert.match(lower("(ns, s) => s.a !== null").diagnostics[0].message, /null/);
});

test("x === null still compares, but does not narrow through an early return either", () => {
  const r = lower("(ns, s) => { const x = ns.find((n) => n > 5); if (x === null) return -1; return x + 1; }");
  assert.ok(r.diagnostics.some((d) => d.severity === "error"));
  assert.deepEqual(lower("(ns, s) => { const x = ns.find((n) => n > 5); return x === null; }").diagnostics, []);
});
