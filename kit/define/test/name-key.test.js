// An instance is named by its construct's name() opening, whatever its record key. Without one it goes by
// its construct's name: a slot, a lambda slot or a child construct called `name` does not rename it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda } from "../index.js";

const tiny = () => defineDialect({
  name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: [], returns: "infer", space: "s" } },
});

test("a slot named `name` in a construct without a name() opening", () => {
  const g = defineGrammar(tiny(), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", slots: { name: { kind: "decl", args: [data("string")], once: true }, k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const r = g.lower(g("x").t().name("hello").k("() => 1").build());
  assert.deepEqual(r.lambdas.map((l) => [l.ref.on, l.ref.id]), [["t", "t.k"]]);
});

test("a lambda slot named `name`: the instance is not named by the lambda's source", () => {
  const g = defineGrammar(tiny(), { root: "p", constructs: {
    p: { opens: [name()] },
    t: { parent: "p", slots: { name: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const r = g.lower(g("x").t().name("() => 1").build());
  assert.deepEqual(r.lambdas.map((l) => [l.ref.on, l.ref.id]), [["t", "t.name"]]);
});

test("a child construct named `name` under a construct without a name() opening", () => {
  const g = defineGrammar(tiny(), { root: "p", constructs: {
    p: { slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
    name: { parent: "p", opens: [name()] },
  } });
  const b = g();
  b.name("n1");
  const r = g.lower(b.k("() => 1").build());
  assert.deepEqual(r.lambdas.map((l) => [l.ref.on, l.ref.id]), [["p", "p.k"]]);
});

test("a name() opening under a record key of its own still names the instance", () => {
  const g = defineGrammar(tiny(), { root: "p", constructs: {
    p: { opens: [name({ as: "title" })], slots: { k: { kind: "decl", args: [lambda("k")], once: true } } },
  } });
  const r = g.lower(g("report").k("() => 1").build());
  assert.deepEqual(r.lambdas.map((l) => l.ref.on), ["report"]);
});
