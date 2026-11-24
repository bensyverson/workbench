// Probe: two stateful instances with one name in different constructs (leaf qCA7Tl, parked on a design decision:
// how a Dialect's ref.id and `states` tell them apart).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../../kit/define/index.js";

test("P5 two stateful instances with the same name in different constructs: each gets its own state", () => {
  const d = defineDialect({
    name: "tiny", numberType: "f64", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: (_ref, _p, state) => ({ params: [], returns: /** @type {any} */ (state).ret, space: "s" }) },
  });
  const mk = (ret) => ({ parent: "p", opens: [name()], record: "calls", state: { init: () => ({ ret }), step: (s) => s }, slots: {} });
  const a = { ...mk("f64"), slots: { ka: { kind: "decl", args: [lambda("k")] } } };
  const b = { ...mk("bool"), slots: { kb: { kind: "decl", args: [lambda("k")] } } };
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()] }, a, b } });
  const bl = g("x").a("same").ka("() => 1").b("same").kb("() => true");
  assert.deepEqual(bl.check(), []);
  const r = g.lower(bl.build());
  assert.deepEqual(r.diagnostics.map((x) => x.code), [], JSON.stringify(r.diagnostics.map((x) => x.message)));
  assert.equal(Object.keys(r.states).length, 2, `states: ${JSON.stringify(r.states)}`);
});
