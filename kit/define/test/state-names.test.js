// Stateful construct instances share one namespace, because stateOf(name) and `states` look them up by name
// alone (leaf qCA7Tl, P5 of the kit/define review).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const dialect = () => defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: (_ref, _p, state) => ({ params: [], returns: /** @type {any} */ (state).ret, space: "s" }) },
});
/** @param {string} ret @param {any[]} opens @returns {any} */
const stateful = (ret, opens) => ({ parent: "p", opens, record: /** @type {const} */ ("calls"), state: { init: () => ({ ret }), step: (/** @type {unknown} */ s) => s } });

test("two stateful instances with one name in different constructs are refused (B002) at check", () => {
  const g = defineGrammar(dialect(), { root: "p", constructs: {
    p: { opens: [name()] },
    a: { ...stateful("f64", [name()]), slots: { ka: { kind: "decl", args: [lambda("k")] } } },
    b: { ...stateful("bool", [name()]), slots: { kb: { kind: "decl", args: [lambda("k")] } } },
  } });
  /** @type {any[]} */
  const diags = g("x").a("same").ka("() => 1").b("same").kb("() => true").check();
  assert.deepEqual(diags.map((d) => d.code), ["B002"]);
  assert.match(diags[0].message, /'same'.*stateOf/);
});

test("two instances of an unnamed stateful construct are refused (B002): both would be named for the construct", () => {
  const g = defineGrammar(dialect(), { root: "p", constructs: {
    p: { opens: [name()] },
    a: { ...stateful("f64", []), slots: { ka: { kind: "decl", args: [lambda("k")] } } },
  } });
  /** @type {any[]} */
  const diags = g("x").a().ka("() => 1").a().ka("() => 2").check();
  assert.deepEqual(diags.map((d) => d.code), ["B002"]);
});
