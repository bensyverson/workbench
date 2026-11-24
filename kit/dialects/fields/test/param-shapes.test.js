// The param shapes the README documents: what B004 refuses, and what must still build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field } from "../index.js";

const px = "(uv, u) => color(0, 0, 0)";

/** @param {() => { build(): unknown }} make @returns {string} */
const refusal = (make) => { try { make().build(); } catch (e) { return /** @type {Error} */ (e).message; } return ""; };

test("B004 refuses what a param shape does not take, and the three real forms build", () => {
  assert.match(refusal(() => field("c").param("a", { value: 1, label: "x" }).pixel(px)), /B004.*'label'/s);
  assert.match(refusal(() => field("c").param("a", { value: true, min: 0 }).pixel(px)), /B004/);
  assert.match(refusal(() => field("c").param("a", { value: 1, options: ["a"] }).pixel(px)), /B004/);
  assert.match(refusal(() => field("c").param("1a", { value: 1 }).pixel(px)), /B004.*identifier/s);
  assert.match(refusal(() => field("c").param("a", { value: 1 }, 5).pixel(px)), /B004.*at most 2/s);
  for (const n of [[], [""], ["a", "b"]]) assert.match(refusal(() => /** @type {any} */ (field)(...n).pixel(px)), /B004/);
  for (const shape of [{ value: 1, min: 0, max: 2, step: 0.5 }, { value: "a", options: ["a", "b"] }, { value: false }]) {
    assert.equal(refusal(() => field("c").param("a", shape).pixel(px)), "", JSON.stringify(shape));
  }
});

test("an optional key given as undefined is as if it were absent (a spread config)", () => {
  assert.equal(refusal(() => field("c").param("a", { value: 1, min: undefined, max: undefined }).pixel(px)), "");
  const p = /** @type {any} */ (field("c").param("a", { value: 1, min: undefined }).pixel(px).build());
  assert.deepEqual(Object.keys(p.params.a).sort(), ["value"]);
});

test("B004 for a bad param shape names the param and lists the forms", () => {
  const m = refusal(() => field("c").param("angle", { value: "x" }).pixel(px));
  assert.match(m, /'angle'/);
  assert.match(m, /options/, "the choice form is listed, not only the number form");
  assert.match(m, /boolean/);
});

test("the B004 for a bad param shape stays short and still names the way out", () => {
  const m = refusal(() => field("c").param("angle", { value: "x" }).pixel(px));
  assert.ok(m.length < 500, m);
  assert.match(m, /fits none of its 3 forms/);
});

test("a bound function is refused as B007 saying it has no source", () => {
  const m = refusal(() => field("c").pixel(/** @type {any} */ ((() => 0).bind(null))));
  assert.match(m, /B007.*no source/s);
  assert.doesNotMatch(m, /function expression/);
});
