// An array's items that do not join are L003. When the two types print the same, the message must
// still say how they differ: a list literal's known length against a list with only a max (leaf cfoinu).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda } from "../index.js";

/** @import { Environment } from "../environment.js" */

/** @type {Environment} */
const env = {
  name: "join message (test)", objects: {}, list: {}, queries: [], globals: {},
  // (p: f64[≤2], n: f64, b: f64[≤3])
  slot: () => ({ params: [{ list: "f64", max: 2 }, "f64", { list: "f64", max: 3 }], returns: "infer", space: "row", forbid: [] }),
};

/** @param {string} src */
const l003 = (src) => lowerLambda(env, src, { id: "t.keep", kind: "keep", on: "t" }).diagnostics.filter((d) => d.code === "L003");

for (const [name, src] of [
  ["an array literal", "(p, n, b) => [p, [n, 1]]"],
  ["a plain run inside a concatenation", "(p, n, b) => [...b, p, [n, 1]]"],
]) {
  test(`${name}: a known length against a max reads differently and says why`, () => {
    const found = l003(src);
    assert.equal(found.length, 1);
    const { message, tip } = found[0];
    assert.match(message, /exactly 2/);
    assert.match(message, /at most 2/);
    assert.match(message, /known length/);
    assert.ok(tip && /null/.test(tip), `the tip says how to read a list's items: ${tip}`);
  });
}

test("a known length against a max one list level down names the inner lists, not the outer ones that are alike", () => {
  const found = l003("(p, n, b) => [[p], [[n, 1]]]");
  assert.equal(found.length, 1);
  const m = found[0].message.match(/this is (.*?) and the items before it are (.*?) \(/);
  assert.ok(m, found[0].message);
  assert.notEqual(m[1], m[2], found[0].message);
  assert.match(found[0].message, /exactly 2/);
  assert.match(found[0].message, /at most 2/);
  assert.match(found[0].message, /inside|within|one level down|items of the items/);
});
