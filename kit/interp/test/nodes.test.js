// One test per node kind that is not an operator: literals, names, loads, structure,
// statements, loops, calls, and the errors a malformed run gives.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../index.js";
import {
  num, f32, str, bool, nul, undef, local, global, op, cond, vec, field, index, array, list, struct, place, load, call, method, helper,
  let_, set, store, do_, if_, for_, each, push, ret, brk, cont, kernel, returning,
} from "./build.js";

/** @import { Type } from "../../ir/ir.js" */

const ENTITY = /** @type {Type} */ ({ ref: "E" });
const LIST = /** @type {Type} */ ({ list: "f64", max: 5 });
const ints = (/** @type {number[]} */ ...xs) => xs;

test("literals: num, str, bool, null, undef", () => {
  assert.equal(run(returning(num(2.5)), []), 2.5);
  assert.equal(run(returning(f32(0.1)), []), Math.fround(0.1));
  assert.equal(run(returning(str("hi")), []), "hi");
  assert.equal(run(returning(bool(false)), []), false);
  assert.equal(run(returning(nul), []), null);
  assert.equal(run(returning(undef), []), undefined);
});

test("local reads a parameter, by position or by name", () => {
  const k = returning(op("sub", "f64", local("a"), local("b")), [["a", "f64"], ["b", "f64"]]);
  assert.equal(run(k, [9, 4]), 5);
  assert.equal(run(k, { b: 4, a: 9 }), 5);
});

test("a missing input is an error naming the parameter", () => {
  const k = returning(local("a"), [["a", "f64"]]);
  assert.throws(() => run(k, []), /parameter 'a'/);
  assert.throws(() => run(k, {}), /parameter 'a'/);
});

test("global reads from the environment", () => {
  const k = returning(global("K", "f64"));
  assert.equal(run(k, [], { globals: { K: 42 } }), 42);
  assert.throws(() => run(k, []), /global 'K'/);
});

test("load reads a place; with no host it is a property read", () => {
  const E = local("e", ENTITY);
  const k = returning(load(place(E, "E", "ttl", "f64", { type: "u16" })), [["e", ENTITY]]);
  assert.equal(run(k, [{ ttl: 7 }]), 7);
});

test("load of an f32 place rounds what the host gives", () => {
  const U = local("u", { obj: "Uniforms" });
  const k = returning(load(place(U, "Uniforms", "k", "f32")), [["u", { obj: "Uniforms" }]]);
  assert.equal(run(k, [{ k: 0.1 }]), Math.fround(0.1));
});

test("cond is lazy: only the branch taken runs", () => {
  /** @type {string[]} */
  const seen = [];
  const env = { intrinsics: { boom: { ref: () => { seen.push("boom"); return 0; } } } };
  const boom = call("boom", "f64", []);
  assert.equal(run(returning(cond(bool(true), num(1), boom, "f64")), [], env), 1);
  assert.equal(run(returning(cond(bool(false), boom, num(2), "f64")), [], env), 2);
  assert.deepEqual(seen, []);
});

test("struct, field, array, index, list", () => {
  const s = struct({ a: num(1), b: str("x") });
  assert.deepEqual(run(returning(s), []), { a: 1, b: "x" });
  assert.equal(run(returning(field(s, "a", "f64")), []), 1);
  const arr = array([num(10), num(20), num(30)], "f64");
  assert.deepEqual(run(returning(arr), []), [10, 20, 30]);
  assert.equal(run(returning(index(arr, num(1), "f64")), []), 20);
  assert.equal(run(returning(index(arr, num(3), { opt: "f64" })), []), undefined, "out of range is undefined");
  assert.equal(run(returning(index(arr, num(-1), { opt: "f64" })), []), undefined);
  assert.deepEqual(run(returning(list("f64", 4)), []), []);
});

test("field of a list reads length", () => {
  const k = returning(field(local("l", LIST), "length", "f64"), [["l", LIST]]);
  assert.equal(run(k, [[1, 2, 3]]), 3);
});

test("an array's items are evaluated in order", () => {
  /** @type {number[]} */
  const seen = [];
  const env = { intrinsics: { tick: { ref: (/** @type {number} */ n) => { seen.push(n); return n; } } } };
  const t = (/** @type {number} */ n) => call("tick", "f64", [num(n)]);
  run(returning(array([t(1), t(2), t(3)], "f64")), [], env);
  assert.deepEqual(seen, [1, 2, 3]);
});

test("let, set, return; a let with no value is undefined until set", () => {
  const k = kernel({ returns: "f64", body: [let_("t", "f64", num(1)), set("t", op("add", "f64", local("t"), num(2))), ret(local("t"))] });
  assert.equal(run(k, []), 3);
  const late = kernel({ returns: "f64", body: [let_("t", "f64", null), if_(bool(true), [set("t", num(8))]), ret(local("t"))] });
  assert.equal(run(late, []), 8);
});

test("a kernel with no return gives undefined", () => {
  assert.equal(run(kernel({ body: [let_("t", "f64", num(1))] }), []), undefined);
  assert.equal(run(kernel({ body: [ret(null)] }), []), undefined);
});

test("scope: a let is local to its block, and each pass of a loop starts fresh", () => {
  const k = kernel({
    returns: "f64",
    body: [
      let_("sum", "f64", num(0)),
      for_("i", 3, [let_("t", "f64", null), if_(op("eq", "bool", local("i"), num(0)), [set("t", num(100))]), set("sum", op("add", "f64", local("sum"), op("add", "f64", local("i"), num(0))))]),
      ret(local("sum")),
    ],
  });
  assert.equal(run(k, []), 3);
});

test("if runs the branch the test picks", () => {
  const k = kernel({ params: [["a", "f64"]], returns: "f64", body: [if_(op("gt", "bool", local("a"), num(0)), [ret(num(1))], [ret(num(-1))])] });
  assert.equal(run(k, [5]), 1);
  assert.equal(run(k, [-5]), -1);
});

test("for counts, and break and continue act on the innermost loop", () => {
  const k = kernel({
    returns: "f64",
    body: [
      let_("sum", "f64", num(0)),
      for_("i", 10, [
        if_(op("eq", "bool", local("i"), num(2)), [cont]),
        if_(op("eq", "bool", local("i"), num(5)), [brk]),
        set("sum", op("add", "f64", local("sum"), local("i"))),
      ]),
      ret(local("sum")),
    ],
  });
  assert.equal(run(k, []), 0 + 1 + 3 + 4);
});

test("an inner break leaves the outer loop running", () => {
  const k = kernel({
    returns: "f64",
    body: [
      let_("n", "f64", num(0)),
      for_("i", 3, [for_("j", 3, [if_(op("eq", "bool", local("j"), num(1)), [brk]), set("n", op("add", "f64", local("n"), num(1)))])]),
      ret(local("n")),
    ],
  });
  assert.equal(run(k, []), 3, "one pass of the inner loop for each of the three outer");
});

test("return inside loops leaves the kernel", () => {
  const k = kernel({ returns: "f64", body: [for_("i", 10, [for_("j", 10, [if_(op("eq", "bool", local("j"), num(3)), [ret(op("add", "f64", local("i"), local("j")))])])]), ret(num(-1))] });
  assert.equal(run(k, []), 3);
});

test("each binds the item and runs over the list; push builds a list", () => {
  const k = kernel({
    params: [["xs", LIST]],
    returns: { list: "f64", max: 5 },
    body: [
      let_("out", { list: "f64", max: 5 }, list("f64", 5)),
      each("x", "f64", local("xs", LIST), 5, [
        if_(op("eq", "bool", local("x"), num(2)), [cont]),
        push("out", op("mul", "f64", local("x"), num(10))),
      ]),
      ret(local("out", { list: "f64", max: 5 })),
    ],
  });
  assert.deepEqual(run(k, [ints(1, 2, 3)]), [10, 30]);
});

test("each refuses a list longer than its max, which the IR promises it is not", () => {
  const two = /** @type {Type} */ ({ list: "f64", max: 2 });
  const k = kernel({ params: [["xs", two]], body: [each("x", "f64", local("xs", two), 2, [])] });
  assert.throws(() => run(k, [ints(1, 2, 3)]), /at most 2/);
});

test("a loop that runs past the step budget stops with an error, not a hang", () => {
  const k = kernel({ body: [for_("i", 1e9, [])] });
  assert.throws(() => run(k, [], { maxSteps: 1000 }), /step budget/);
});

test("store applies the place's rule, then writes through the host", () => {
  const E = local("e", ENTITY);
  const ttl = place(E, "E", "ttl", "f64", { type: "u8" });
  const k = kernel({ params: [["e", ENTITY]], body: [store(ttl, num(260.7))] });
  const e = { ttl: 0 };
  run(k, [e]);
  assert.equal(e.ttl, 4, "260.7 truncates to 260, then wraps in a u8");
});

test("a host may take over a store, and sees the raw and the coerced value", () => {
  const E = local("e", ENTITY);
  const k = kernel({ params: [["e", ENTITY]], body: [store(place(E, "E", "ttl", "f64", { type: "u8" }), num(260.7))] });
  /** @type {unknown[]} */
  const seen = [];
  const e = { ttl: 0 };
  run(k, [e], { host: { store: (p, recv, value, coerced) => { seen.push(p.name, value, coerced); /** @type {any} */ (recv)[p.name] = value; } } });
  assert.deepEqual(seen, ["ttl", 260.7, 4]);
  assert.equal(e.ttl, 260.7);
});

test("a store never feeds back: the value the expression read is the unwrapped one", () => {
  const E = local("e", ENTITY);
  const ttl = place(E, "E", "ttl", "f64", { type: "u8" });
  const k = kernel({
    params: [["e", ENTITY]], returns: "bool",
    body: [let_("t", "f64", op("sub", "f64", load(ttl), num(1))), store(ttl, local("t")), ret(op("eq", "bool", local("t"), num(-1)))],
  });
  const e = { ttl: 0 };
  assert.equal(run(k, [e]), true);
  assert.equal(e.ttl, 255);
});

test("do evaluates its expression for its effects and drops the value", () => {
  /** @type {number[]} */
  const seen = [];
  const env = { intrinsics: { note: { ref: (/** @type {number} */ n) => { seen.push(n); return n; } } } };
  const k = kernel({ returns: "f64", body: [do_(call("note", "f64", [num(1)])), do_(call("note", "f64", [num(2)])), ret(num(0))] });
  assert.equal(run(k, [], env), 0);
  assert.deepEqual(seen, [1, 2]);
});

test("a call to a dialect intrinsic runs its reference implementation", () => {
  const env = { intrinsics: { twice: { ref: (/** @type {number} */ x) => 2 * x } } };
  assert.equal(run(returning(call("twice", "f64", [num(4)])), [], env), 8);
});

test("an intrinsic with no reference implementation is an error naming it", () => {
  assert.throws(() => run(returning(call("nope", "f64", [])), []), /intrinsic 'nope'/);
});

test("a componentwise intrinsic runs per component; a scalar argument is passed whole", () => {
  const V = { vec: /** @type {const} */ (3), of: /** @type {const} */ ("f32") };
  const env = { intrinsics: { addk: { ref: (/** @type {number} */ x, /** @type {number} */ k) => x + k, componentwise: true } } };
  const k = returning(call("addk", V, [local("p", V), f32(0.1)]), [["p", V]]);
  assert.deepEqual(run(k, [[1, 2, 3]], env), [1, 2, 3].map((x) => Math.fround(x + Math.fround(0.1))));
});

test("an intrinsic's f32 result is rounded; a non-componentwise one takes the components spread", () => {
  const V = { vec: /** @type {const} */ (2), of: /** @type {const} */ ("f32") };
  const env = { intrinsics: { len: { ref: Math.hypot } } };
  const k = returning(call("len", "f32", [local("p", V)]), [["p", V]]);
  assert.equal(run(k, [[1, 2]], env), Math.fround(Math.hypot(1, 2)));
});

test("a call on a receiver goes to the host: recv.name(args), or recv(args) when fn has no dot", () => {
  const O = { obj: "Math" };
  const math = call("Math.max", "f64", [num(3), num(9)], { recv: global("Math", O) });
  assert.equal(run(returning(math), [], { globals: { Math } }), 9);
  const FN = { obj: "At" };
  const at = call("At", "f64", [num(4)], { recv: local("at", FN) });
  assert.equal(run(returning(at, [["at", FN]]), [(/** @type {number} */ x) => x + 1]), 5);
});

test("a host method call: method evaluates its receiver, then its arguments, then calls", () => {
  const E = local("e", ENTITY);
  const k = returning(method("E", "bump", E, "f64", [num(2)]), [["e", ENTITY]]);
  assert.equal(run(k, [{ bump: (/** @type {number} */ n) => n + 40 }]), 42);
});

test("env.methods runs a program method as a kernel, with the receiver first", () => {
  const bump = kernel({ name: "E.method(bump)#0", params: [["self", ENTITY], ["n", "f64"]], returns: "f64", body: [ret(op("add", "f64", load(place(local("self", ENTITY), "E", "base", "f64", { type: "f64" })), local("n")))] });
  const k = returning(method("E", "bump", local("e", ENTITY), "f64", [num(2)]), [["e", ENTITY]]);
  assert.equal(run(k, [{ base: 100 }], { methods: { "E.bump": bump } }), 102);
});

test("helper runs another kernel by name, which cannot see the caller's locals", () => {
  const double = kernel({ name: "double", params: [["x", "f64"]], returns: "f64", body: [ret(op("mul", "f64", local("x"), num(2)))] });
  const k = kernel({ returns: "f64", body: [let_("x", "f64", num(100)), ret(helper("double", "f64", [num(21)]))] });
  assert.equal(run(k, [], { helpers: { double } }), 42);
  assert.throws(() => run(k, []), /helper 'double'/);
});

test("a helper may call another helper, and a recursion past the depth limit stops", () => {
  const inc = kernel({ name: "inc", params: [["x", "f64"]], returns: "f64", body: [ret(op("add", "f64", local("x"), num(1)))] });
  const inc2 = kernel({ name: "inc2", params: [["x", "f64"]], returns: "f64", body: [ret(helper("inc", "f64", [helper("inc", "f64", [local("x")])]))] });
  const k = returning(helper("inc2", "f64", [num(0)]));
  assert.equal(run(k, [], { helpers: { inc, inc2 } }), 2);
  const loop = kernel({ name: "loop", params: [["x", "f64"]], returns: "f64", body: [ret(helper("loop", "f64", [local("x")]))] });
  assert.throws(() => run(returning(helper("loop", "f64", [num(0)])), [], { helpers: { loop }, maxDepth: 50 }), /depth/);
});

test("a helper that is a plain function is called with its arguments", () => {
  const k = returning(helper("f", "f64", [num(3)]));
  assert.equal(run(k, [], { helpers: { f: (/** @type {number} */ x) => x + 1 } }), 4);
});

test("a vector local can be rebuilt and a vec's components read back", () => {
  const V = { vec: /** @type {const} */ (2), of: /** @type {const} */ ("f32"), name: "vec2" };
  const k = kernel({
    returns: "f32",
    body: [
      let_("p", V, vec([f32(1), f32(2)], "f32", "vec2")),
      set("p", vec([f32(5), field(local("p", V), "y", "f32")], "f32", "vec2")),
      ret(op("add", "f32", field(local("p", V), "x", "f32"), field(local("p", V), "y", "f32"))),
    ],
  });
  assert.equal(run(k, []), 7);
});
