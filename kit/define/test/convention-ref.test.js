// What a slot convention function's `ref` says about the call it lowers (H5, 2026-11-25: a root slot's ref had no
// key, so a convention could not tell which of several `.force("name", …)` calls it was lowering).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data, lambda, recordOf } from "../index.js";

/** A Dialect whose `f` convention records every ref it is called with. @param {any[]} seen */
const recording = (seen) => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { f: (/** @type {any} */ ref) => { seen.push({ ...ref }); return { params: [], returns: "infer", space: "s" }; } },
});

/** The distinct refs seen, by id, in first-seen order. @param {any[]} seen */
const byId = (seen) => [...new Map(seen.map((r) => [r.id, r])).values()];

test("a root slot whose first argument is a name(): ref.key is the declared name, and ids are unchanged", () => {
  /** @type {any[]} */
  const seen = [];
  const g = defineGrammar(recording(seen), { root: "p", constructs: {
    p: { opens: [name()], slots: {
      size: { kind: "decl", args: [data("number")] },
      force: { kind: "decl", args: [name("force"), lambda("f")] },
    } },
  } });
  const r = g.lower(g("x").force("gravity", "() => 1").size(3).force("drag", "() => 2").build());
  assert.deepEqual(r.diagnostics, []);
  const refs = byId(seen);
  assert.deepEqual(refs.map((x) => [x.id, x.key, x.on]), [["x.force#0", "gravity", "x"], ["x.force#1", "drag", "x"]]);
});

test("a record: \"calls\" construct: ref.index is the call's position among its slot's calls, and ref.key the declared name", () => {
  /** @type {any[]} */
  const seen = [];
  const g = defineGrammar(recording(seen), { root: "p", constructs: {
    p: { opens: [name()] },
    e: { parent: "p", opens: [name()], record: "calls", slots: {
      size: { kind: "decl", args: [data("number")] },
      force: { kind: "decl", args: [name("force"), lambda("f")] },
    } },
  } });
  const r = g.lower(g("x").e("jet").size(1).force("gravity", "() => 1").force("drag", "() => 2").build());
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(byId(seen).map((x) => [x.index, x.key, x.on]), [[0, "gravity", "jet"], [1, "drag", "jet"]]);
});

test("a lambda under a recordOf key keeps that key as ref.key; a slot without a name() gives none", () => {
  /** @type {any[]} */
  const seen = [];
  const g = defineGrammar(recording(seen), { root: "p", constructs: {
    p: { opens: [name()], slots: {
      on: { kind: "decl", args: [data(recordOf(lambda("f")))] },
      plain: { kind: "decl", args: [lambda("f")] },
    } },
  } });
  const r = g.lower(g("x").on({ hit: "() => 1" }).plain("() => 2").build());
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(byId(seen).map((x) => [x.id, x.key]), [["x.on#0.hit", "hit"], ["x.plain#0", undefined]]);
});
