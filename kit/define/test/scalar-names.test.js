// A type in `types` (vector or scalar) may not be named like a built-in type or a one-letter type variable:
// it would hijack that name everywhere (D007). Longer and lower-case names stay free.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, scalar, vector, exact, DefinitionError } from "../index.js";

const def = (/** @type {any} */ types) => /** @type {any} */ ({
  name: "rows", numberType: /** @type {const} */ ("f64"), text: () => "",
  types,
  spaces: { row: { pure: true } },
  objects: { Row: { label: "a row", members: { price: "f64" } } },
  intrinsics: { pick: { params: ["T", "T"], returns: "T", ref: (/** @type {any} */ a) => a, spell: { js: "($0)" } } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["Row", "f64"], returns: "bool", space: "row" } },
});

const refusal = (/** @type {any} */ types) => {
  try { defineDialect(def(types)); } catch (e) { assert.ok(e instanceof DefinitionError, String(e)); return e.diagnostics; }
  return null;
};

for (const n of ["f32", "f64", "bool", "str", "null", "void", "unknown", "T", "A", "Z"]) {
  test(`a scalar named ${n} is refused (D007)`, () => {
    const ps = refusal({ [n]: scalar("f64") });
    assert.ok(ps, `${n} was accepted`);
    assert.ok(ps.some((p) => p.code === "D007" && /built-in|type variable/.test(p.message)), JSON.stringify(ps));
  });
  test(`a vector named ${n} is refused (D007)`, () => {
    const ps = refusal({ [n]: vector(2, "f32") });
    assert.ok(ps?.some((p) => p.code === "D007"), JSON.stringify(ps));
  });
}

test("ordinary type names are still accepted", () => {
  for (const n of ["date", "Vec2", "TT", "t", "F64", "Row2"]) assert.equal(refusal({ [n]: scalar("f64") }), null, n);
  assert.equal(refusal({ vec2: vector(2, "f32") }), null);
});

test("an accepted scalar resolves in a slot and the type variable stays a type variable", () => {
  const d = defineDialect(def({ date: scalar("f64") }));
  assert.deepEqual(d.intrinsics.pick.sig.params[0], { tvar: "T" });
  const s = /** @type {any} */ (d.environment({}).slot({ id: "r.keep", kind: "keep", on: "r" }));
  assert.equal(s.params[1], "f64");
  assert.equal(s.returns, "bool");
});
