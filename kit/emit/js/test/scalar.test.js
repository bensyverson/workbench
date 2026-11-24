// The nominal scalar in the JavaScript backend: emitted as a plain number (no rounding, no wrapper),
// and agreeing with the reference interpreter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitKernel, instantiate } from "../index.js";
import { run } from "../../../interp/index.js";
import * as c from "../../../interp/test/build.js";
import { dialectScalar } from "../../../ir/types.js";

const DATE = dialectScalar("date", "f64");
const days = [Date.UTC(2024, 0, 1), Date.UTC(2024, 1, 29), Date.UTC(1969, 11, 31), 0, 8.64e15];

test("a scalar compare emits JavaScript's operator on the numbers and agrees with the interpreter", () => {
  const a = c.local("a", DATE), b = c.local("b", DATE);
  const later = c.kernel({
    name: "t.later", params: [["a", DATE], ["b", DATE]], returns: DATE,
    body: [c.let_("x", DATE, c.cond(c.op("gt", "bool", a, b), a, b, DATE)), c.ret(c.local("x", DATE))],
  });
  const e = emitKernel(later);
  assert.deepEqual(e.prelude, [], "a scalar needs no runtime");
  assert.doesNotMatch(e.source, /fround|\$/, "nor any rounding");
  const fn = instantiate(e);
  for (const x of days) for (const y of days) {
    assert.equal(fn(x, y), run(later, [x, y]), `${x} ${y}`);
    assert.equal(typeof fn(x, y), "number");
  }
  for (const o of /** @type {const} */ (["lt", "le", "gt", "ge", "eq", "ne"])) {
    const k = c.kernel({ name: `t.${o}`, params: [["a", DATE], ["b", DATE]], returns: "bool", body: [c.ret(c.op(o, "bool", a, b))] });
    const f = instantiate(emitKernel(k));
    for (const x of days) for (const y of days) assert.equal(f(x, y), run(k, [x, y]), `${o} ${x} ${y}`);
  }
});
