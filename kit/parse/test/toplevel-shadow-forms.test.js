// buildTimeShadows after ada5def counts only `export default`'s own block body as build code. An export written
// through a name (`export default build`, `export { build as default }`) has its build code skipped, so a lambda
// reading the inner K silently resolves to the top-level K (fail open). Before ada5def every below-top name counted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeShadows } from "../toplevel.js";

const cases = {
  "arrow const, export default name": "const K = 1;\nconst build = ($) => { const K = 2; return b().f((p) => K); };\nexport default build;",
  "function declaration, export default name": "const K = 1;\nfunction build($) { const K = 2; return b().f((p) => K); }\nexport default build;",
  "export { build as default }": "const K = 1;\nconst build = ($) => { const K = 2; return b().f((p) => K); };\nexport { build as default };",
  "a build-time map callback in the export's expression": "const K = 1;\nexport default ($) => b().layers([1, 2].map((K) => layer().f((p) => K)));",
  "an IIFE in the export's expression": "const K = 1;\nexport default ($) => b().f(((K) => (p) => K)(2));",
  "control: export default arrow": "const K = 1;\nexport default ($) => { const K = 2; return b().f((p) => K); };",
};
for (const [name, code] of Object.entries(cases)) {
  test(`the inner K is a shadow: ${name}`, () => assert.deepEqual(buildTimeShadows(code), ["K"]));
}
