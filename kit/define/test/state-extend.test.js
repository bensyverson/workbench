// Per-Program state (Ben's ruling 2, 2026-11-26): a Dialect marks one state struct extensible, and the fields a
// Program declares, as environment(program) returns them in `state`, are added to it. The Dialect value gives the
// extended Type per Program (stateTypeFor), the declared fields (stateFields) and a check against them
// (checkState(value, program)); without a Program the check reads the extensible struct's own fields only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, list, struct, opt, union, vector, name, data, lambda, DefinitionError } from "../index.js";

/** @param {Record<string, any>} [over] */
function decl(over = {}) {
  return {
    name: "swarm", numberType: "f64", text: () => "",
    types: { v2: vector(2, "f64") },
    spaces: { s: { pure: true } },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    environment(/** @type {any} */ program) {
      /** @type {Record<string, unknown>} */
      const state = {};
      for (const [n, f] of Object.entries(program.fields ?? {})) state[n] = /** @type {any} */ (f).kind === "vec" ? "v2" : "f64";
      return { state };
    },
    state: { t: "f64", items: list(struct({ x: "f64" }, { extensible: true }), 100) },
    ...over,
  };
}

/** @param {any} e @returns {string[]} */
const codesOf = (e) => (e instanceof DefinitionError ? /** @type {any} */ (e).diagnostics.map((/** @type {any} */ d) => d.code) : []);

test("an extensible state struct takes the fields a Program declares: stateFields, stateTypeFor and checkState(value, program)", () => {
  const d = /** @type {any} */ (defineDialect(/** @type {any} */ (decl())));
  const program = { fields: { heat: { kind: "num" }, drift: { kind: "vec" } } };
  assert.deepEqual(d.stateFields(program), { heat: "f64", drift: "v2" });
  const t = d.stateTypeFor(program);
  assert.deepEqual(Object.keys(t.struct.items.list.struct), ["x", "heat", "drift"]);
  assert.equal(t.struct.items.list.struct.drift.vec, 2);
  assert.deepEqual(Object.keys(d.stateType.struct.items.list.struct), ["x"], "the Dialect's own stateType is unchanged");
  assert.equal(d.stateTypeFor(program), t, "one Type per Program record");
  const good = { t: 0, items: [{ x: 1, heat: 2, drift: [0, 1] }] };
  assert.deepEqual(d.checkState(good, program), []);
  assert.deepEqual(d.checkState({ t: 0, items: [{ x: 1, heat: 2 }] }, program).map((/** @type {any} */ m) => [m.path, m.message]), [["items[0].drift", "missing"]]);
  assert.deepEqual(d.checkState({ t: 0, items: [{ x: 1, heat: "hot", drift: [0, 1] }] }, program).map((/** @type {any} */ m) => m.path), ["items[0].heat"]);
});

test("a field the Program does not declare, inside the extensible struct, is marked outside; elsewhere it is an ordinary mismatch", () => {
  const d = /** @type {any} */ (defineDialect(/** @type {any} */ (decl())));
  const program = { fields: { heat: { kind: "num" } } };
  const bad = d.checkState({ t: 0, items: [{ x: 1, heat: 2, spin: 3 }] }, program);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].path, "items[0].spin");
  assert.equal(bad[0].outside, true);
  assert.match(bad[0].message, /not a field the Program declares/);
  const top = d.checkState({ t: 0, items: [], extra: 1 }, program);
  assert.deepEqual(top.map((/** @type {any} */ m) => [m.path, m.outside ?? false]), [["extra", false]]);
});

test("without a Program, checkState and text read the extensible struct's own fields and let a Program's through", () => {
  const seen = /** @type {any[]} */ ([]);
  const d = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ text: (/** @type {any} */ s) => { seen.push(s); return "ok"; } }))));
  assert.deepEqual(d.checkState({ t: 0, items: [{ x: 1, heat: 2 }] }), []);
  assert.equal(d.checkState({ t: 0, items: [{ heat: 2 }] }).length, 1, "a declared field is still required");
  assert.equal(d.text({ t: 0, items: [{ x: 1, heat: 2 }] }), "ok");
  const program = { fields: { heat: { kind: "num" } } };
  assert.throws(() => d.text({ t: 0, items: [{ x: 1 }] }, program), /items\[0\]\.heat: missing/, "with a Program, text checks the extended shape");
});

test("a Program that declares nothing, or a Dialect whose environment returns no state, extends nothing", () => {
  const d = /** @type {any} */ (defineDialect(/** @type {any} */ (decl())));
  assert.deepEqual(d.stateFields({}), {});
  assert.deepEqual(Object.keys(d.stateTypeFor({}).struct.items.list.struct), ["x"]);
  assert.equal(d.checkState({ t: 0, items: [{ x: 1, y: 2 }] }, {})[0].outside, true);
  const plain = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ environment: undefined, state: { t: "f64" } }))));
  assert.deepEqual(plain.stateFields({ fields: { heat: {} } }), {});
  assert.equal(plain.stateTypeFor({}), plain.stateType);
});

test("an extensible struct may start with no fields, at the top of state or inside a list or an opt", () => {
  const top = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ state: { t: "f64", own: struct({}, { extensible: true }) } }))));
  assert.deepEqual(top.stateTypeFor({ fields: { heat: {} } }).struct.own.struct, { heat: "f64" });
  const inOpt = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ state: { t: "f64", own: opt(struct({ a: "f64" }, { extensible: true })) } }))));
  assert.deepEqual(Object.keys(inOpt.stateTypeFor({ fields: { heat: {} } }).struct.own.opt.struct), ["a", "heat"]);
});

test("D023: two extensible structs, one inside a union, or the option anywhere but true", () => {
  const two = () => defineDialect(/** @type {any} */ (decl({ state: { a: struct({}, { extensible: true }), b: list(struct({ x: "f64" }, { extensible: true }), 4) } })));
  assert.throws(two, (e) => codesOf(e).includes("D023") && /one extensible struct/.test(String(/** @type {any} */ (e).message)));
  const inUnion = () => defineDialect(/** @type {any} */ (decl({ state: { a: union("f64", struct({ x: "f64" }, { extensible: true })) } })));
  assert.throws(inUnion, (e) => codesOf(e).includes("D023") && /union/.test(String(/** @type {any} */ (e).message)));
  const notTrue = () => defineDialect(/** @type {any} */ (decl({ state: { a: struct({ x: "f64" }, { extensible: "yes" }) } })));
  assert.throws(notTrue, (e) => codesOf(e).includes("D023"));
  const empty = () => defineDialect(/** @type {any} */ (decl({ state: { a: struct({}) } })));
  assert.throws(empty, (e) => codesOf(e).includes("D023"), "an empty struct that is not extensible is still refused");
});

test("D023: a Program-declared field is not extensible, however deep", () => {
  const d = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ environment: () => ({ state: { h: struct({ a: "f64" }, { extensible: true }) } }) }))));
  assert.throws(() => d.stateTypeFor({}), (e) => codesOf(e).includes("D023") && /extensible/.test(String(/** @type {any} */ (e).message)));
  const deep = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ environment: () => ({ state: { h: list(struct({ a: "f64" }, { extensible: true }), 4) } }) }))));
  assert.throws(() => deep.stateTypeFor({}), (e) => codesOf(e).includes("D023"));
  const plain = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ environment: () => ({ state: { h: struct({ a: "f64" }) } }) }))));
  assert.deepEqual(Object.keys(plain.stateFields({})), ["h"], "a plain struct is still fine");
});

test("D011: extensible outside the run's state", () => {
  const f = () => defineDialect(/** @type {any} */ (decl({ slots: { k: { params: [struct({ x: "f64" }, { extensible: true })], returns: "f64", space: "s" } } })));
  assert.throws(f, (e) => codesOf(e).includes("D011") && /extensible.*only in the run's state/.test(String(/** @type {any} */ (e).message)));
});

test("what environment(program) adds to state is judged: a field the struct has (D007), a type state cannot hold (D023), state with nothing extensible (D023)", () => {
  const clash = /** @type {any} */ (defineDialect(/** @type {any} */ (decl())));
  assert.throws(() => clash.stateFields({ fields: { x: {} } }), (e) => codesOf(e).includes("D007") && /x/.test(String(/** @type {any} */ (e).message)));
  const badType = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ environment: () => ({ state: { h: "void" } }) }))));
  assert.throws(() => badType.stateTypeFor({}), (e) => codesOf(e).includes("D023"));
  const none = /** @type {any} */ (defineDialect(/** @type {any} */ (decl({ state: { t: "f64" } }))));
  assert.throws(() => none.stateFields({ fields: { heat: {} } }), (e) => codesOf(e).includes("D023") && /extensible/.test(String(/** @type {any} */ (e).message)));
  assert.deepEqual(none.stateFields({}), {}, "an empty state addition is no problem");
});

test("a Program's bad state fields are refused when it lowers, as its other environment additions are", () => {
  const d = defineDialect(/** @type {any} */ (decl()));
  const g = defineGrammar(d, { root: "swarm", constructs: { swarm: { opens: [name()], slots: {
    field: { kind: "decl", args: [name("field"), data({ kind: "string" })], as: "fields" },
    k: { kind: "decl", args: [lambda("k")] },
  } } } });
  const ok = /** @type {any} */ (g)("a").field("heat", { kind: "num" }).k("() => 1").build();
  assert.deepEqual(/** @type {any} */ (g).lower(ok).diagnostics, []);
  const clash = /** @type {any} */ (g)("b").field("x", { kind: "num" }).k("() => 1").build();
  assert.throws(() => /** @type {any} */ (g).lower(clash), (e) => codesOf(e).includes("D007"));
});
