// A param named like an Object.prototype member (constructor, toString, __proto__) is an ordinary param: the
// built-in-uniform check asks about own names only, so it neither clashes nor throws from lowering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field, lowerField } from "../index.js";
import { prepare } from "../../../harness/pipeline.js";

const NAMES = ["constructor", "toString", "valueOf", "__proto__", "hasOwnProperty"];

for (const n of NAMES) {
  test(`a param named ${n} builds, lowers, runs and emits GLSL like any other`, () => {
    const program = field("c").param(n, { value: 0.5 }).pixel(`(uv, u) => color(u.${n}, 0, 0)`).build();
    assert.deepEqual(Object.keys(program.params), [n]);
    const lowered = lowerField(program);
    assert.deepEqual(lowered.diagnostics, []);
    assert.ok(lowered.kernel);
    const p = prepare(program);
    assert.deepEqual(p.js([0, 0], { [n]: 0.25 }), [0.25, 0, 0]);
    assert.match(String(p.glsl.source), /uniform float/);
  });
}

test("the built-in uniforms t and aspect are still refused as param names", () => {
  assert.throws(() => field("c").param("t", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build(), /F002/);
  assert.throws(() => field("c").param("aspect", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build(), /F002/);
});
