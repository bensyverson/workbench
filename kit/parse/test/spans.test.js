// Every span in every corpus tree names the node's own source. Lowering and the
// emitter's line map trust these spans, so an expression's slice must compile alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda } from "../index.js";
import { inventory } from "../../../scripts/dmg-oracle/inventory.js";

const EXPRESSIONS = new Set([
  "Identifier", "Literal", "TemplateLiteral", "ArrayExpression", "ObjectExpression", "ArrowFunctionExpression", "UnaryExpression",
  "UpdateExpression", "BinaryExpression", "LogicalExpression", "AssignmentExpression", "ConditionalExpression", "CallExpression",
  "NewExpression", "MemberExpression", "SequenceExpression",
]);
/** Whether `s` is one complete expression on its own. @param {string} s */
const compiles = (s) => { try { new Function(`return (${s}\n);`); return true; } catch { return false; } };

test("every expression span in the corpus slices to source that compiles on its own", () => {
  let seen = 0;
  /** @type {string[]} */
  const bad = [];
  /** @param {string} id @param {string} src @param {any} n @param {any} parent */
  const walk = (id, src, n, parent) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) walk(id, src, x, parent); return; }
    if (typeof n.type !== "string") return;
    const slice = src.slice(n.range[0], n.range[1]);
    if (parent) assert.ok(n.range[0] >= parent.range[0] && n.range[1] <= parent.range[1], `${id}: ${n.type} escapes its ${parent.type}`);
    if (EXPRESSIONS.has(n.type)) {
      seen++;
      if (!compiles(slice)) bad.push(`${id} ${n.type}: ${JSON.stringify(slice.slice(0, 60))}`);
    }
    if (n.type === "TemplateElement") assert.equal(slice, n.value.raw, `${id}: a template element spans only its text`);
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") walk(id, src, v, n);
  };
  for (const e of inventory()) {
    const r = parseLambda(e.src);
    if (r.ok) walk(`${e.preset} ${e.id}`, e.src, r.ast, null);
  }
  assert.ok(seen > 3000, `walked ${seen} expressions`);
  assert.deepEqual(bad, []);
});
