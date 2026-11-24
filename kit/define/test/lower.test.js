// The grammar's lower(record): fields Kernels identical to lowerField's for every sketch; and on the
// test-only table Dialect, construct state threaded through each table's calls in order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field, lowerField } from "../../dialects/fields/index.js";
import { program } from "../fixtures/table-dialect.js";
import { defineDialect, defineGrammar, exact, name, lambda, BUILD_CODES } from "../index.js";
import { swirl, bulge } from "../../dialects/fields/programs/uv-remaps.js";
import { swirlCalls, bulgeCalls } from "../../dialects/fields/programs/uv-remaps-calls.js";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { domainWarpCalls } from "../../dialects/fields/programs/domain-warp-calls.js";

/** @import { FieldProgram } from "../../dialects/fields/decls.js" */

/**
 * The same Program through the generated field(): every param, unit and the pixel, replayed.
 * @param {FieldProgram} p
 */
function rebuilt(p) {
  /** @type {any} */
  let b = field(p.name);
  for (const [n, d] of Object.entries(p.params)) b = b.param(n, d);
  for (const u of p.units) b = b[u.kind](u.name, u.src);
  return b.pixel(p.pixel).build();
}

test("fields Kernels through lower() are identical to lowerField's, for every sketch", () => {
  for (const p of [swirl, bulge, swirlCalls, bulgeCalls, domainWarp, domainWarpCalls]) {
    const want = lowerField(p);
    const got = field.lower(rebuilt(p));
    assert.deepEqual(got.diagnostics, [], p.name);
    assert.equal(got.lambdas.length, 1);
    assert.equal(JSON.stringify(got.lambdas[0].result.kernel), JSON.stringify(want.kernel), `${p.name}: pixel`);
    assert.deepEqual(got.helpers.map((h) => h.name), want.helpers.map((h) => h.name), p.name);
    got.helpers.forEach((h, i) => assert.equal(JSON.stringify(h.result.kernel), JSON.stringify(want.helpers[i].result.kernel), `${p.name}: ${h.name}`));
  }
});

test("a lambda's type error comes from lowering, with its L code", () => {
  const r = field.lower(field("bad").pixel("(uv, u) => color(u.tme, 0, 0)").build());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L002"]);
  assert.match(r.diagnostics[0].message + r.diagnostics[0].tip, /no member 'tme'.*Members: t, aspect/s);
});

const source = () => program("p").source("sales", { price: "f64", qty: "f64", region: "str" }).param("minQty", 2);

test("derived column types flow to later steps and tables, with no type argument", () => {
  const record = source()
    .table("monthly", "sales")
    .derive("revenue", "(row) => row.price * row.qty")
    .derive("label", "(row) => row.region")
    .filter("(row) => row.revenue > $.minQty && row.label === \"west\"")
    .groupBy("region")
    .agg({ total: "(g) => g.sum(\"revenue\")", n: "(g) => g.count()" })
    .table("big", "monthly")
    .filter("(r) => r.total > 100 && r.region === \"east\" && r.n > 1")
    .limit("() => $.minQty")
    .build();
  const r = program.lower(record);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["monthly.derive#0", "monthly.derive#1", "monthly.filter#2", "monthly.agg#4.total", "monthly.agg#4.n", "big.filter#0", "big.limit#1"]);
  assert.ok(r.lambdas.every((l) => l.result.kernel));
  assert.deepEqual(r.states.monthly, { columns: { region: "str", total: "f64", n: "f64" } });
  assert.deepEqual(r.states.big, r.states.monthly);
});

test("ref(\"column\") is checked against the table as it stands at that step, with a did-you-mean", () => {
  const r = program.lower(source().table("t", "sales").derive("revenue", "(row) => row.price").groupBy("regoin", "revenue").build());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["B003"]);
  assert.match(r.diagnostics[0].message, /no column 'regoin'.*Did you mean 'region'/);
  assert.match(/** @type {any} */ (r.diagnostics[0]).file, /lower\.test\.js$/, "at the call's place in the author's file");
  const early = program.lower(source().table("t", "sales").groupBy("revenue").derive("revenue", "(row) => row.price").build());
  assert.deepEqual(early.diagnostics.map((d) => d.code), ["B003"], "a column a later step adds is not there yet");
});

test("a lambda reading a column a later step adds is refused by lowering (L002)", () => {
  const r = program.lower(source().table("t", "sales").filter("(row) => row.revenue > 0").derive("revenue", "(row) => row.price * row.qty").build());
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["L002"]);
  assert.match(r.diagnostics[0].message, /revenue/);
});

test("a table whose state depends on itself through stateOf is refused (B010)", () => {
  const r = program.lower(source().table("a", "b").filter("(r) => true").table("b", "a").build());
  assert.ok(r.diagnostics.some((d) => d.code === "B010"), r.diagnostics.map((d) => d.code).join());
  assert.match(String(r.diagnostics.find((d) => d.code === "B010")?.message), /a.*b|b.*a/);
});

test("B010 names each instance on a stateOf loop as depending on itself, and one that only reads a loop as reading it", () => {
  const r = program.lower(source().table("a", "b").table("b", "a").table("c", "a").build());
  const b010 = r.diagnostics.filter((d) => d.code === "B010").map((d) => d.message);
  assert.equal(b010.length, 3);
  assert.match(b010[0], /table 'a' depends on its own state through stateOf: a → b → a/);
  assert.match(b010[1], /table 'b' depends on its own state through stateOf: b → a → b/);
  assert.match(b010[2], /table 'c' reads, through stateOf, a state that depends on itself: a → b → a/);
  assert.doesNotMatch(b010[2], /depends on its own state/);
});

test("a convention that returns a reason refuses the lambda (B011); every builder code is exercised", () => {
  const d = defineDialect({
    name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (ref) => (ref.index === 0 ? "not first" : { params: [], returns: "f64", space: "s" }) },
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  const r = g.lower(g("x").k("() => 1").k("() => 2").build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), ["B011"]);
  assert.match(r.diagnostics[0].message, /not first/);
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["x.k#1"]);
  assert.deepEqual(Object.keys(BUILD_CODES), ["B001", "B002", "B003", "B004", "B005", "B006", "B007", "B008", "B009", "B010", "B011", "B012", "B013", "B014", "B015"]);
});
