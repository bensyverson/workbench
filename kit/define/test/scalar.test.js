// defineDialect accepts a nominal scalar in `types` (scalar("f64", { note })): its name resolves to the
// core's named scalar wherever a type is named (a slot's params, an object's member, an intrinsic's
// signature, a global), it is no constructor a lambda can call, and its lambdas lower under the core's
// rules: compared with its own kind, refused (L003) with anything else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, scalar, vector, exact, opt, list, name, lambda, BuildError, DefinitionError } from "../index.js";
import { fromCore } from "../lower.js";
import { dialectScalar } from "../../ir/types.js";
import { lowerLambda } from "../../lower/index.js";

const DATE = dialectScalar("date", "f64");

const def = () => /** @type {Record<string, any>} */ ({
  name: "rows", numberType: "f64",
  types: { date: scalar("f64", { note: "milliseconds since 1970-01-01, UTC" }), vec2: vector(2, "f64") },
  spaces: { row: { pure: true } },
  objects: { Row: { label: "a row", members: { due: "date", paid: opt("date"), history: list("date", 8), price: "f64" } } },
  globals: { epoch: "date" },
  intrinsics: { later: { params: ["date", "date"], returns: "date", ref: Math.max, spell: { js: "Math.max($0, $1)" } } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { keep: { params: ["Row", "date"], returns: "bool", space: "row" }, when: { params: ["Row"], returns: "date", space: "row" } },
});

test("a scalar in types is accepted, and its name resolves to the core's named scalar everywhere", () => {
  const d = defineDialect(/** @type {any} */ (def()));
  const env = d.environment({});
  assert.deepEqual(env.objects.Row.members.due, { kind: "value", t: DATE });
  assert.deepEqual(env.objects.Row.members.paid, { kind: "value", t: { opt: DATE } });
  assert.deepEqual(env.objects.Row.members.history, { kind: "value", t: { list: DATE, max: 8 } });
  assert.deepEqual(env.globals.epoch, DATE);
  assert.deepEqual(d.intrinsics.later.sig, { params: [DATE, DATE], returns: DATE, effects: [] });
  assert.deepEqual(env.slot({ id: "r.keep", kind: "keep", on: "r" }), { params: [{ obj: "Row" }, DATE], returns: "bool", space: "row", forbid: [] });
  assert.deepEqual(Object.keys(env.vectors ?? {}), ["vec2"], "a scalar is no vector constructor");
});

test("a scalar without a note is accepted; a scalar may also be named in a convention function's result", () => {
  const x = def();
  x.types.date = scalar("f64");
  x.slots.keep = () => ({ params: ["Row", "date"], returns: "bool", space: "row" });
  const env = defineDialect(/** @type {any} */ (x)).environment({});
  assert.deepEqual(/** @type {any} */ (env.slot({ id: "r.keep", kind: "keep", on: "r" })).params[1], DATE);
});

test("a lambda of the Dialect compares dates with dates, and is refused L003 for anything else", () => {
  const env = defineDialect(/** @type {any} */ (def())).environment({});
  const lower = (/** @type {string} */ src, kind = "keep") => lowerLambda(env, src, { id: `r.${kind}`, kind, on: "r" });
  for (const src of ["(r, d) => r.due < d", "(r, d) => later(r.due, d) === d", "(r, d) => epoch <= r.due && r.due !== d"]) {
    assert.deepEqual(lower(src).diagnostics, [], src);
  }
  assert.deepEqual(lower("(r) => later(r.due, epoch)", "when").diagnostics, []);
  for (const src of ["(r, d) => r.due - d < 0", "(r, d) => r.due < r.price", "(r, d) => d + 1 > d", "(r, d) => d === 0"]) {
    assert.deepEqual(lower(src).diagnostics.map((x) => x.code), ["L003"], src);
  }
  assert.deepEqual(lower("(r, d) => date(0) < d").diagnostics.map((x) => x.code), ["L001"], "date is a type, not a callable name");
});

test("scalar() written where a type is named is refused: it is declared in types, then named", () => {
  const x = def();
  x.slots.keep.params = ["Row", scalar("f64")];
  assert.throws(() => defineDialect(/** @type {any} */ (x)), (/** @type {unknown} */ e) => {
    assert.ok(e instanceof DefinitionError);
    assert.deepEqual(e.diagnostics.map((d) => d.code), ["D002"]);
    assert.match(e.diagnostics[0].message, /nominal scalar, which is declared in types/);
    assert.match(e.diagnostics[0].tip, /scalar\("f64"/);
    return true;
  });
});

test("a malformed scalar is refused with every problem", () => {
  for (const [types, code, message] of /** @type {Array<[unknown, string, RegExp]>} */ ([
    [scalar("f32"), "D002", /"f64"/],
    [scalar(undefined), "D002", /"f64"/],
    [scalar("f64", "ms"), "D011", /note/],
    [scalar("f64", { note: 3 }), "D011", /note/],
  ])) {
    const x = def();
    x.types.date = types;
    assert.throws(() => defineDialect(/** @type {any} */ (x)), (/** @type {unknown} */ e) => {
      assert.ok(e instanceof DefinitionError);
      assert.deepEqual(e.diagnostics.map((d) => d.code), [code]);
      assert.match(e.diagnostics[0].message, /date/);
      assert.match(e.diagnostics[0].message, message);
      return true;
    });
  }
});

test("a lambda's inferred scalar reaches a construct's step by its name", () => {
  assert.equal(fromCore(DATE), "date");
  assert.deepEqual(fromCore({ opt: DATE }), opt("date"));
});

test("a scalar's name is not a free name a lambda may call (B008), while a vector's still is", () => {
  const rows = defineGrammar(defineDialect(/** @type {any} */ (def())), { root: "rows", constructs: { rows: { opens: [name()], slots: {
    keep: { kind: "decl", args: [lambda("keep")], once: true, required: true } } } } });
  assert.throws(() => rows("r").keep("(r, d) => date(0) < d").build(), (/** @type {unknown} */ e) => {
    assert.ok(e instanceof BuildError);
    assert.deepEqual(e.diagnostics.map((x) => x.code), ["B008"]);
    assert.match(e.diagnostics[0].message, /date/);
    return true;
  });
  const record = rows("r").keep("(r, d) => vec2(0, 0).x < r.price && r.due < d").build();
  assert.deepEqual(rows.lower(record).diagnostics, []);
});
