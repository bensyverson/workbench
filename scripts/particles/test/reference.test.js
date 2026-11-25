// The particles reference (leaf 8vQJOw) against the blind hidden set, with the API pilot's scorer: every accept
// program checks clean, and every reject program is refused except the seven Ben ruled out of H5's scope
// (2026-11-25; scripts/particles/hidden/README.md): six need a Runtime Subset narrower than the kit's, and r22l a
// lambda given through a variable. If one of those starts passing, or another starts failing, this test says so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../../api-pilot/score/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_OF_SCOPE = ["r21b.js", "r21c.js", "r21l.js", "r21n.js", "r21s.js", "r21u.js", "r22l.js"];

test("the reference passes every hidden particles program but the seven out of H5's scope", async () => {
  const r = await score(join(HERE, "..", "reference"), join(HERE, "..", "hidden"), { lang: "particles" });
  assert.deepEqual(r.definitions.codes, []);
  const failing = r.results.filter((x) => !x.pass).map((x) => `${x.kind}/${x.file}`);
  assert.deepEqual(failing, OUT_OF_SCOPE.map((f) => `reject/${f}`));
  assert.equal(r.accept.pass, r.accept.of);
});
