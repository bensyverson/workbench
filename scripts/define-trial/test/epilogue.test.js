// Review of 613926f (job AtIcKn), finding 4, from the reviewer's probe local/rev-scope-probes/epilogue.probe.js:
// the epilogue that hands an example's top-level bindings to the checker must not shadow any of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withScope, SCOPE_EXPORT } from "../checker/hooks.js";

/** @param {string} src */
const load = (src) => import(`data:text/javascript,${encodeURIComponent(src)}`);

test("a top-level binding named like the epilogue's own local still reaches the scope", async () => {
  const m = await load(withScope("export const o = 2;\nexport const K = 3;\nconst scope = 4;\nconst out = 5;\n"));
  const s = m[SCOPE_EXPORT]();
  assert.deepEqual({ ...s }, { o: 2, K: 3, scope: 4, out: 5 });
});
