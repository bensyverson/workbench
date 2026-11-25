// The particles reference (leaf 8vQJOw) against the blind hidden set, with the API pilot's scorer: every accept
// program checks clean, and every reject program is refused except the seven Ben ruled out of H5's scope
// (2026-11-25; scripts/particles/hidden/README.md): six need a Runtime Subset narrower than the kit's, and r22l a
// lambda given through a variable. The programs added after the H5 run (leaf JWdGeK) test sheet rules the Definition
// API cannot say yet (decision MpZZsU), and the reference fails 12 of them (r12n, once accept a28, it refuses since the sheet gave helper parameters one type); they are pinned too, so building a gap
// shows here as a program starting to pass. If one starts passing, or another starts failing, this test says so.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../../api-pilot/score/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_OF_SCOPE = ["r21b.js", "r21c.js", "r21l.js", "r21n.js", "r21s.js", "r21u.js", "r22l.js"];
/** Added after the H5 run; each needs a Definition API change pending in MpZZsU. */
const API_GAPS = ["reject/r06d.js", "reject/r08b.js", "reject/r08c.js", "reject/r11e.js", "reject/r11f.js", "reject/r12f.js", "reject/r12g.js", "reject/r12h.js", "reject/r12i.js", "reject/r12j.js", "reject/r12k.js", "reject/r24h.js"];

test("the reference passes every hidden particles program but the seven out of H5's scope and the API gaps", async () => {
  const r = await score(join(HERE, "..", "reference"), join(HERE, "..", "hidden"), { lang: "particles" });
  assert.deepEqual(r.definitions.codes, []);
  const failing = r.results.filter((x) => !x.pass).map((x) => `${x.kind}/${x.file}`);
  assert.deepEqual(failing.sort(), [...OUT_OF_SCOPE.map((f) => `reject/${f}`), ...API_GAPS].sort());
});
