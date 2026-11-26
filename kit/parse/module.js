// The one place the kit touches the vendored parser (kit/vendor/acorn); everything else asks for a tree here:
// kit/package's import check, and the whole-file scan in toplevel.js. No Node built-ins.

import { parse, tokenizer } from "../vendor/acorn/acorn.mjs";

/** @typedef {import("../vendor/acorn/acorn.mjs").Node} AstNode */

/** @type {import("../vendor/acorn/acorn.mjs").Options} */
const OPTIONS = { ecmaVersion: "latest", sourceType: "module", locations: true };

/**
 * Parses `text` as an ES module, with line/column locations. Throws a SyntaxError carrying `loc.line` (1-based)
 * when the text is not a module.
 * @param {string} text
 * @returns {AstNode}
 */
export function parseModule(text) {
  return parse(text, OPTIONS);
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

/**
 * The source with every comment, string, regex literal and template literal's text replaced by spaces (a line
 * break stays one), the same length as the source, so an offset into it is an offset into the source: code and
 * brackets stay where they were. A string or regex keeps the character at each end of its quotes or slashes, a
 * template its backticks, and a template's `${` becomes ` (` and its closing `}` a `)`, so the expressions in it
 * read as code. A module is read with its syntax tree, so a `/` is a regex exactly where JavaScript says; text
 * that is not a module (a method's source, a fragment) is read token by token as far as it goes, where the
 * tokenizer guesses a regex from the token before, and what follows a token it cannot read is left as it was.
 * @param {string} text
 * @returns {string}
 */
export function blank(text) {
  /** @type {import("../vendor/acorn/acorn.mjs").Token[]} */
  const tokens = [];
  /** @type {Array<[number, number]>} */
  const comments = [];
  const onComment = (/** @type {boolean} */ _b, /** @type {string} */ _t, /** @type {number} */ start, /** @type {number} */ end) => { comments.push([start, end]); };
  try {
    parse(text, { ...OPTIONS, locations: false, onToken: tokens, onComment });
  } catch {
    tokens.length = 0;
    comments.length = 0;
    try {
      for (const t of tokenizer(text, { ...OPTIONS, locations: false, onComment })) tokens.push(t);
    } catch { /* what the tokenizer could not read stays as written */ }
  }
  const out = text.split("");
  const clear = (/** @type {number} */ from, /** @type {number} */ to) => { for (let i = from; i < to; i++) if (out[i] !== "\n" && out[i] !== "\r" && out[i] !== " " && out[i] !== " ") out[i] = " "; };
  for (const [s, e] of comments) clear(s, e);
  /** What each `{` and `${` still open, so a `}` is known to close a template's expression. @type {boolean[]} */
  const open = [];
  for (const t of tokens) {
    const label = t.type.label;
    if (label === "string") clear(t.start + 1, t.end - 1);
    else if (label === "regexp") clear(t.start + 1, text.lastIndexOf("/", t.end - 1));
    else if (label === "template") clear(t.start, t.end);
    else if (label === "${") { open.push(true); out[t.start] = " "; out[t.start + 1] = "("; }
    else if (label === "{") open.push(false);
    else if (label === "}") { if (open.pop()) out[t.start] = ")"; }
  }
  return out.join("");
}
