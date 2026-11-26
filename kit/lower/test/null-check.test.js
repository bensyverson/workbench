// An explicit null check lowers with its JavaScript meaning; the loose ones (`x != null`, `x == undefined`, …)
// narrow an optional as truthiness does, but tests emptiness only: an optional date at the epoch (stored as 0) or an
// optional number holding 0 is present. The environment is a stand-in written for these tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";
import { dialectScalar } from "../../ir/types.js";
import { printKernel } from "../../ir/print.js";
import { run } from "../../interp/run.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";

/** @import { Environment } from "../environment.js" */
/** @import { Kernel } from "../../ir/ir.js" */

const DATE = dialectScalar("date", "f64");

/** @type {Environment} */
const environment = {
  name: "null checks (test)",
  objects: {},
  list: {},
  queries: [],
  globals: {},
  // (a: date, o: date?, m: f64?)
  slot: () => ({ params: [DATE, { opt: DATE }, { opt: "f64" }], returns: "infer", space: "row", forbid: [] }),
};

const P = "(a, o, m) =>";

/** @param {string} src */
const lower = (src) => lowerLambda(environment, src, { id: "t.keep", kind: "keep", on: "t" });

/** Lowers `src`, asserting no diagnostic but the parser's S116 warning on a loose `==` / `!=`. @param {string} src */
function ok(src) {
  const r = lower(src);
  assert.deepEqual(r.diagnostics.filter((d) => d.code !== "S116").map((d) => `${d.code} ${d.message}`), [], src);
  return /** @type {Kernel} */ (r.kernel);
}

// Changed in hxjaI2: the strict `x !== null` / `x === null` no longer narrow (the core gives undefined for some
// empty values, for which `!== null` is true; see null-check-strict.test.js), so these lists hold the loose forms only.
const PRESENT = ["x != null", "x != undefined", "undefined != x", "null != x"];
const ABSENT = ["x == null", "x == undefined", "undefined == x", "null == x"];

test("a strict null check compares but does not narrow", () => {
  for (const c of ["x !== null", "null !== x"]) {
    assert.ok(lower(`${P} { const x = m; if (${c}) { return x + 1 > 2; } return false; }`).diagnostics.some((d) => d.code === "L003"), c);
    assert.ok(lower(`${P} { const x = o; if (${c} && x < a) return true; return false; }`).diagnostics.some((d) => d.code === "L003"), c);
  }
  for (const c of ["x === null", "null === x"]) assert.ok(lower(`${P} { const x = m; return ${c} || x > 0; }`).diagnostics.some((d) => d.code === "L003"), c);
});

test("an explicit null check narrows an optional scalar and an optional number inside the test's branch", () => {
  for (const c of PRESENT) {
    ok(`${P} { const x = o; if (${c} && x < a) return true; return false; }`);
    ok(`${P} { const x = o; if (${c}) { return x < a; } return false; }`);
    ok(`${P} { const x = m; if (${c}) { return x + 1 > 2; } return false; }`);
    ok(`${P} { const x = m; return ${c} && x > 0; }`);
  }
});

test("the negated forms narrow through else branches and early returns, as truthiness does", () => {
  for (const c of ABSENT) {
    ok(`${P} { const x = o; if (${c}) return false; return x < a; }`);
    ok(`${P} { const x = o; if (${c}) { return false; } else { return x < a; } }`);
    ok(`${P} { const x = m; return ${c} || x > 0; }`);
  }
  ok(`${P} { const x = o; if (!(x == null)) return x < a; return false; }`);
  ok(`${P} { const x = o; if (x != null) { } else { return false; } return x < a; }`);
});

test("a loose null check lowers to present, its negation to not(present); a strict one keeps ne / eq", () => {
  assert.match(printKernel(ok(`${P} { const x = o; return x != null; }`)), /present\(x\)/);
  assert.match(printKernel(ok(`${P} { const x = m; return x == undefined; }`)), /not\(present\(x\)\)/);
  assert.match(printKernel(ok(`${P} { const x = o; return x !== null; }`)), /ne\(x, null\)/);
  assert.match(printKernel(ok(`${P} { const x = o; return x === null; }`)), /eq\(x, null\)/);
});

test("an optional date at the epoch is present after an explicit null check", () => {
  // [o, expected]: the epoch is present, null is not; the loose form also takes a missing value (undefined) as absent.
  const cases = { "x != null": [[0, true], [null, false], [undefined, false]] };
  for (const [check, rows] of Object.entries(cases)) {
    const k = ok(`${P} { const x = o; if (${check} && x < a) return true; return false; }`);
    const js = instantiate(emitKernel(k));
    for (const [o, want] of rows) {
      assert.equal(run(k, [1, o, null]), want, `${check}: interpreter, o = ${o}`);
      assert.equal(js(1, o, null), want, `${check}: emitted JS, o = ${o}`);
    }
  }
});

test("a strict check against undefined is refused, since null is the empty value and it is true for null", () => {
  for (const c of ["x !== undefined", "undefined === x"]) {
    const r = lower(`${P} { const x = o; return ${c}; }`);
    assert.deepEqual(r.diagnostics.map((d) => d.code), ["L003"], c);
    // The tip names only the loose check: since hxjaI2, `x !== null` narrows nothing, so recommending it misleads.
    assert.match(r.diagnostics[0].tip, /^Use x (!=|==) null, which matches undefined/, c);
  }
});

test("equality of two values and the refusals stay as they were; truthiness of an optional is refused", () => {
  // A bare optional is not a condition (the tip names the null check).
  assert.deepEqual(lower(`${P} { const x = m; if (x) return x > 0; return false; }`).diagnostics.map((d) => d.code), ["L003"]);
  assert.equal(run(ok(`${P} { const x = m; if (x != null) return x > 0; return false; }`), [1, null, 0]), false);
  // Two optionals compared to each other are an equality, not a null check.
  assert.match(printKernel(ok(`${P} o === o`)), /eq\(o, o\)/);
  // A value that is never empty can never equal null.
  assert.deepEqual(lower(`${P} a !== null`).diagnostics.map((d) => d.code), ["L003"]);
  // `undefined` is still not a value on its own.
  assert.deepEqual(lower(`${P} { const u = undefined; return true; }`).diagnostics.map((d) => d.code), ["L001"]);
  // A `let` does not narrow, by either kind of test.
  assert.deepEqual(lower(`${P} { let x = o; if (x !== null) return x < a; return false; }`).diagnostics.map((d) => d.code), ["L003"]);
});
