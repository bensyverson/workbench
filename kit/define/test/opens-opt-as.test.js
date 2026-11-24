// An optional opening argument records under the key of the spec it wraps: `opt(ref("t", { as: "from" }))`
// is `from`, not `arg1` (found while preparing dogfood trial 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, ref, opt } from "../index.js";

const d = defineDialect({ name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: { k: { params: [], returns: "infer", space: "s" } } });

const g = defineGrammar(d, { root: "p", constructs: {
  p: { opens: [name()] },
  t: { parent: "p", opens: [name("t"), opt(ref("t", { as: "from" }))], slots: {} },
} });

test("opt(ref(ns, { as })) in opens records under its as key", () => {
  const rec = /** @type {any} */ (g("x").t("a").t("b", "a").build());
  assert.deepEqual(rec.t, [{ t: "a" }, { t: "b", from: "a" }]);
});

test("an opt(ref(ns)) without as records under its namespace, as a bare ref does", () => {
  const g2 = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()] }, u: { parent: "p", opens: [name("u"), opt(ref("v"))], slots: {} }, v: { parent: "p", opens: [name("v")], slots: {} } } });
  const rec = /** @type {any} */ (g2("x").v("w").u("a", "w").build());
  assert.deepEqual(rec.u, [{ u: "a", v: "w" }]);
});
