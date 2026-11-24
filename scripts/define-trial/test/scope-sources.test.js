// Review of c7ed99f (job tIbqDV), finding L3, from the reviewer's probe local/rev-bind-probes/letreassign.probe.js:
// a `let` helper can be reassigned to an arrow made by other code whose text is the same, so only a `const`
// declaration's initializer vouches for a helper. The checker hands the kit only those.
// @ts-nocheck: the lambdas name fields' free names and the module's bindings, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withScope, SCOPE_EXPORT } from "../checker/hooks.js";
import { helperSources } from "../checker/examples.js";
import { field } from "../../../kit/dialects/fields/grammar.js";

/** @param {string} text */
async function scopeOf(text) {
  const m = await import(`data:text/javascript,${encodeURIComponent(withScope(text))}`);
  return { scope: m[SCOPE_EXPORT](), sources: helperSources(text) };
}

test("a let helper reassigned to a factory's arrow with the same text is B012, not resolved against the module's k", async () => {
  const options = await scopeOf("const k = 10;\nconst mk = (k) => (x) => x * k;\nlet triple = (x) => x * k;\ntriple = mk(3);\n");
  const ds = field("f").pixel((uv) => color(triple(uv.x), 0, 0)).check(options);
  assert.deepEqual(ds.map((d) => d.code), ["B012"]);
  assert.match(ds[0].message, /triple.*const/);
});

test("a const helper still resolves, and a let constant is still baked from its value", async () => {
  const options = await scopeOf("let K = 2;\nconst twice = (x) => x * K;\n");
  assert.deepEqual(options.sources, { twice: "(x) => x * K" });
  const record = field("f").pixel((uv) => color(twice(uv.x), 0, 0)).build(options);
  assert.deepEqual(record.units, [{ name: "twice", kind: "fn", src: "(x) => x * K" }, { name: "K", kind: "const", src: "2" }]);
});
