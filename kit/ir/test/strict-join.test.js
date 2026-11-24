// The strict join: the closed list of ways two types become one, used for call-site
// parameter types and array items. Unlike `join`, it never falls back to a union.
import { test } from "node:test";
import assert from "node:assert/strict";
import { strictJoin, join, dialectEnum, assignable } from "../types.js";

/** @import { Type } from "../ir.js" */

const mole = /** @type {Type} */ ({ ref: "Mole" });
const spark = /** @type {Type} */ ({ ref: "Spark" });
const lit = (/** @type {string[]} */ ...v) => /** @type {Type} */ ({ enum: v });

test("the same type joins to itself, and unknown yields to anything", () => {
  assert.deepEqual(strictJoin("f64", "f64"), "f64");
  assert.deepEqual(strictJoin(mole, mole), mole);
  assert.deepEqual(strictJoin({ struct: { x: "f64" } }, { struct: { x: "f64" } }), { struct: { x: "f64" } });
  assert.deepEqual(strictJoin("unknown", mole), mole);
  assert.deepEqual(strictJoin(mole, "unknown"), mole);
});

test("two string literals or enums join to the union of their members", () => {
  assert.deepEqual(strictJoin(lit("a"), lit("b")), lit("a", "b"));
  assert.deepEqual(strictJoin(lit("a", "b"), lit("b", "c")), lit("a", "b", "c"));
  assert.deepEqual(strictJoin(lit("a"), lit("a")), lit("a"));
});

test("a string literal or enum and plain str join to str", () => {
  assert.equal(strictJoin(lit("a"), "str"), "str");
  assert.equal(strictJoin("str", lit("a", "b")), "str");
});

test("a dialect enum is nominal: a literal joins it only by membership, and two dialect enums do not join", () => {
  const order = dialectEnum(["random", "sweep"]);
  const kind = dialectEnum(["Mole"]);
  assert.deepEqual(strictJoin(order, lit("sweep")), order);
  assert.deepEqual(strictJoin(lit("sweep"), order), order);
  assert.deepEqual(strictJoin(lit("random", "sweep"), order), order, "every member of the literals' enum is a member");
  assert.equal(strictJoin(order, lit("diagonal")), null);
  assert.equal(strictJoin(lit("diagonal"), order), null);
  assert.equal(strictJoin(order, lit("sweep", "diagonal")), null, "one non-member is enough");
  assert.equal(strictJoin(order, kind), null);
  assert.equal(strictJoin(kind, order), null);
  assert.deepEqual(strictJoin(order, dialectEnum(["sweep", "random"])), order, "the same members are the same enum");
  assert.equal(strictJoin(order, "str"), "str");
  assert.equal(strictJoin("str", order), "str");
  assert.deepEqual(strictJoin(order, "null"), { opt: order });
  assert.deepEqual(strictJoin({ opt: order }, lit("sweep")), { opt: order });
  assert.equal(strictJoin({ opt: order }, lit("diagonal")), null);
});

test("dialectEnum marks the enum as declared, and the mark does not change what is assignable", () => {
  const order = dialectEnum(["random", "sweep"]);
  assert.deepEqual(order, { enum: ["random", "sweep"], declared: true });
  assert.ok(assignable(lit("sweep"), order));
  assert.ok(assignable(order, "str"));
  assert.ok(!assignable(lit("diagonal"), order));
});

test("void never joins: null and a void value are not one parameter's type", () => {
  assert.equal(strictJoin("null", "void"), null);
  assert.equal(strictJoin("void", "null"), null);
  assert.equal(strictJoin("void", "f64"), null);
  assert.equal(strictJoin({ opt: "f64" }, "void"), null);
});

test("a value and null join to possibly empty, in either order", () => {
  assert.deepEqual(strictJoin(mole, "null"), { opt: mole });
  assert.deepEqual(strictJoin("null", mole), { opt: mole });
  assert.deepEqual(strictJoin("f64", "null"), { opt: "f64" });
  assert.deepEqual(strictJoin({ opt: mole }, mole), { opt: mole });
  assert.deepEqual(strictJoin(mole, { opt: mole }), { opt: mole });
  assert.deepEqual(strictJoin({ opt: lit("a") }, lit("b")), { opt: lit("a", "b") });
  assert.equal(strictJoin("null", "null"), "null");
});

test("anything else does not join, where the general join would build a union", () => {
  for (const [a, b] of /** @type {Array<[Type, Type]>} */ ([
    ["f64", "str"], ["f64", lit("a")], ["f64", "bool"], [mole, spark], [mole, "f64"],
    [{ obj: "World" }, { obj: "Input" }],
    [{ struct: { x: "f64" } }, { struct: { x: "f64", y: "f64" } }],
    [{ struct: { x: "f64" } }, { struct: { y: "f64" } }],
    [{ struct: { x: "f64" } }, mole],
    [{ list: "f64", max: 2 }, { list: "f64", max: 3 }],
    [{ list: "f64", max: 2 }, { list: "str", max: 2 }],
    [{ list: "f64", max: 2, len: 2 }, { list: "f64", max: 3, len: 3 }],
    [{ list: "f64", max: 2, len: 2 }, { list: "f64", max: 2 }],
    [{ opt: mole }, spark],
  ])) {
    assert.equal(strictJoin(a, b), null, `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    assert.equal(strictJoin(b, a), null, "and in the other order");
  }
  assert.ok(join("f64", "str") !== null, "the general join still unions (it is not the strict one)");
});

test("the join is symmetric", () => {
  /** @type {Type[]} */
  const all = ["f64", "str", "null", "void", lit("a"), lit("b"), dialectEnum(["a", "b"]), dialectEnum(["a"]), { opt: lit("a") }, mole, { opt: mole }, spark];
  for (const a of all) for (const b of all) {
    assert.deepEqual(strictJoin(a, b), strictJoin(b, a), `${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  }
});
