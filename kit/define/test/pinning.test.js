// Where lower()'s diagnostics point: each is tied to its call or lambda.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";
import { program } from "../fixtures/table-dialect.js";

const lineHere = () => Number([...(new Error().stack ?? "").matchAll(/pinning\.test\.js:(\d+)/g)][1]?.[1]);

test("B011 in a by-slot construct points at the refused call, not the construct's opening, and names its lambda", () => {
  const d = defineDialect({
    name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (ref) => (ref.index === 1 ? "not second" : { params: [], returns: "f64", space: "s" }) },
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  const open = lineHere() + 1;
  const b = g("x")
    .k("() => 1")
    .k("() => 2");
  const r = g.lower(b.build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), ["B011"]);
  const diag = /** @type {any} */ (r.diagnostics[0]);
  assert.equal(diag.loc.start.line, open + 2, `pinned at line ${diag.loc.start.line}; the construct opens at ${open}, the refused call is at ${open + 2}`);
  assert.equal(diag.ref.id, "x.k#1");
  assert.deepEqual(r.lambdas.map((l) => l.ref.id), ["x.k#0"]);
});

test("each call of a by-slot construct keeps its own place, also in a name slot", () => {
  const d = defineDialect({
    name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (ref) => (ref.index === 1 ? "no" : { params: [], returns: "f64", space: "s" }) },
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [name("n"), lambda("k")] } } } } });
  const open = lineHere() + 1;
  const b = g("x")
    .k("a", "() => 1")
    .k("b", "() => 2");
  const r = g.lower(b.build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), ["B011"]);
  assert.equal(/** @type {any} */ (r.diagnostics[0]).loc.start.line, open + 2);
});

test("an L diagnostic in the flat list says which lambda it belongs to", () => {
  const r = program.lower(program("p").source("s", { a: "f64" }).table("t", "s").filter("(row) => row.a > 0").filter("(row) => row.zz > 0").build());
  assert.equal(r.diagnostics.length, 1);
  const d = /** @type {any} */ (r.diagnostics[0]);
  assert.match(d.code, /^L/);
  assert.match(d.file, /pinning\.test\.js$/);
  assert.equal(d.ref.id, "t.filter#1");
  assert.equal(d.ref.kind, "row");
});
