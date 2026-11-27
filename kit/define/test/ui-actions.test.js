// Actions (project/2026-11-27-controls-draft.md, requirement 11; build plan group 8): a UI names a trusted module's
// export the host calls with the run's record, state, params and files, giving a file or edits. U019 refuses a
// malformed one, and with moduleText a module that has no such export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineUI, DefinitionError } from "../index.js";
import { lens } from "../fixtures/controls-dialects.js";

/** @param {unknown} decl @param {any} [options] */
function codes(decl, options) {
  try { defineUI(lens(), /** @type {any} */ (decl), options); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return /** @type {any} */ (e).diagnostics.map((/** @type {any} */ d) => d.code);
  }
}
const action = (/** @type {Record<string, unknown>} */ o) => ({ actions: { optimize: { label: "Optimize", module: "./optimize.js", export: "optimize", gives: "edits", ...o } } });

test("8. an action builds; U019 for each malformed case; with moduleText, a module lacking the export is U019", () => {
  const ui = defineUI(lens(), action({}));
  assert.deepEqual({ ...ui.actions.optimize }, { label: "Optimize", module: "./optimize.js", export: "optimize", gives: "edits" });
  assert.deepEqual(codes(action({ module: "optimize.js" })), ["U019"], "a module path not ./<file>.js");
  assert.deepEqual(codes(action({ module: "../optimize.js" })), ["U019"]);
  assert.deepEqual(codes(action({ export: "two words" })), ["U019"], "an export that is no identifier");
  assert.deepEqual(codes(action({ gives: "pdf" })), ["U019"], "an unknown gives");
  assert.deepEqual(codes(action({ when: "now" })), ["U019"], "an unknown key");
  const text = (/** @type {string} */ body) => ({ moduleText: (/** @type {string} */ p) => (p === "./optimize.js" ? body : null) });
  assert.deepEqual(codes(action({}), text("export function other() {}")), ["U019"]);
  assert.deepEqual(codes(action({}), text("export async function optimize({ record }) { return []; }")), []);
  assert.deepEqual(codes(action({}), text("const optimize = () => [];\nexport { optimize };")), []);
});
