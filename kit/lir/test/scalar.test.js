// The nominal scalar has no form in the first LIR stage: it is an f64 underneath, and GLSL has none,
// so a kernel that holds one is refused (R002) and names the scalar, rather than narrowed to f32.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerToLir } from "../index.js";
import * as c from "../../interp/test/build.js";
import { dialectScalar } from "../../ir/types.js";

const DATE = dialectScalar("date", "f64");

test("R002: a kernel holding a nominal scalar is refused, naming it", () => {
  const k = c.kernel({ name: "t.keep", params: [["a", DATE], ["b", DATE]], returns: "bool", body: [c.ret(c.op("lt", "bool", c.local("a", DATE), c.local("b", DATE)))] });
  const r = lowerToLir({ name: "t", main: k, helpers: [], uniforms: {} }, { spell: () => null });
  assert.equal(r.program, null);
  assert.ok(r.diagnostics.length > 0);
  for (const d of r.diagnostics) {
    assert.equal(d.code, "R002");
    assert.match(d.message, /\bdate\b/);
  }
});
