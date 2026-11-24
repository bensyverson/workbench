// The fields Dialect is declared through the Definition API (kit/define): its tables are read from the
// Dialect value, its builder is the generated one, and that builder takes a real arrow function as a lambda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fields, field, lowerField, fieldsEnvironment, FIELDS_DIALECT, INTRINSICS, LIBRARY, libraryFor, VECTORS } from "../index.js";
import { BuildError } from "../../../define/index.js";
import { printKernel } from "../../../ir/print.js";

/** Stands in for the fields constructor so TypeScript can read the lambdas below; they are lowered, never run. */
const color = (/** @type {number[]} */ ..._c) => _c;

test("every table is read from the Dialect defineDialect made", () => {
  assert.equal(field.dialect, fields, "the builder is generated from the Dialect");
  assert.equal(INTRINSICS, fields.intrinsics);
  assert.equal(LIBRARY, fields.library);
  assert.equal(FIELDS_DIALECT.intrinsics, fields.intrinsics);
  assert.equal(FIELDS_DIALECT.library, fields.library);
  assert.deepEqual(FIELDS_DIALECT.targets, { js: { accepts: "*", compare: fields.targets.js.compare }, glsl: { accepts: { domains: ["pixel"] }, compare: fields.targets.glsl.compare } });
  const { slot: _mine, ...mine } = fieldsEnvironment({ k: { value: 1 } });
  const { slot: _made, ...made } = fields.environment({ params: { k: { value: 1 } } });
  assert.deepEqual(mine, made);
  assert.deepEqual(VECTORS, fieldsEnvironment({}).vectors);
  const src = "(uv, u) => color(fbm(uv, 1), 0, 0)";
  assert.deepEqual(libraryFor([src]), fields.libraryFor([src]));
});

test("a pixel lambda may be a real arrow function: its text is lowered, as a string's is", () => {
  const fn = field("f").param("k", { value: 2 }).pixel((/** @type {any} */ uv, /** @type {any} */ u) => color(uv.x * u.k, uv.y, 0)).build();
  const str = field("f").param("k", { value: 2 }).pixel("(uv, u) => color(uv.x * u.k, uv.y, 0)").build();
  assert.equal(typeof fn.pixel, "string");
  const a = lowerField(fn);
  assert.deepEqual(a.diagnostics, []);
  assert.ok(a.kernel);
  const b = lowerField(str).kernel;
  assert.ok(b);
  assert.equal(printKernel(a.kernel), printKernel(b), "the same Kernel; only spans differ, the function's text holding its JSDoc");
});

test("a Library name is refused when the Program is built (B002), naming the Library", () => {
  assert.throws(() => field("c").fn("vnoise", "(p, s) => 0.25").pixel("(uv, u) => color(0, 0, 0)").build(),
    (/** @type {unknown} */ e) => e instanceof BuildError && e.code === "B002" && /'vnoise'.*Library|Library.*'vnoise'/.test(e.message));
});
