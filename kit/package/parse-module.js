// The one place kit/package touches the vendored parser (kit/vendor/acorn); everything else asks for a tree here.

import { parse } from "../vendor/acorn/acorn.mjs";

/** @typedef {import("../vendor/acorn/acorn.mjs").Node} AstNode */

/**
 * Parses `text` as an ES module, with line/column locations. Throws a SyntaxError carrying `loc.line` (1-based)
 * when the text is not a module.
 * @param {string} text
 * @returns {AstNode}
 */
export function parseModule(text) {
  return parse(text, { ecmaVersion: "latest", sourceType: "module", locations: true });
}

/**
 * Calls `visit` on every node of the tree, parents first.
 * @param {AstNode} root
 * @param {(node: AstNode) => void} visit
 */
export function walkNodes(root, visit) {
  /** @type {unknown[]} */
  const stack = [root];
  for (let x = stack.pop(); x !== undefined; x = stack.pop()) {
    if (Array.isArray(x)) { for (let i = x.length - 1; i >= 0; i--) stack.push(x[i]); continue; }
    if (x === null || typeof x !== "object") continue;
    if (typeof /** @type {{ type?: unknown }} */ (x).type !== "string") continue;
    visit(/** @type {AstNode} */ (x));
    const values = Object.values(x);
    for (let i = values.length - 1; i >= 0; i--) if (typeof values[i] === "object") stack.push(values[i]);
  }
}
