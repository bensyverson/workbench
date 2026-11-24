// The nominal scalar in the reference interpreter: a date is its f64 (milliseconds since the epoch in
// the data Dialect's reading), compared as a number and handed back unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import * as c from "./build.js";
import { dialectScalar } from "../../ir/types.js";

const DATE = dialectScalar("date", "f64");
const JAN = Date.UTC(2024, 0, 1), FEB = Date.UTC(2024, 1, 1);

test("a scalar compares as its f64 and is returned as a plain number", () => {
  const earlier = c.kernel({
    name: "t.earlier", params: [["a", DATE], ["b", DATE]], returns: DATE,
    body: [c.ret(c.cond(c.op("le", "bool", c.local("a", DATE), c.local("b", DATE)), c.local("a", DATE), c.local("b", DATE), DATE))],
  });
  assert.equal(run(earlier, [FEB, JAN]), JAN);
  assert.equal(run(earlier, { a: JAN, b: FEB }), JAN);
  for (const [o, want] of /** @type {const} */ ([["lt", true], ["le", true], ["gt", false], ["ge", false], ["eq", false], ["ne", true]])) {
    const k = c.kernel({ name: `t.${o}`, params: [["a", DATE], ["b", DATE]], returns: "bool", body: [c.ret(c.op(o, "bool", c.local("a", DATE), c.local("b", DATE)))] });
    assert.equal(run(k, [JAN, FEB]), want, o);
  }
});
