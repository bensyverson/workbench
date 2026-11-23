// The runtime subset as a table of rules over the syntax tree. Each rule reports a
// construct outside the subset with a code, a one-line tip and, where the rewrite
// is mechanical, a fixit. Reporting every violation at once lets an author or agent
// fix a lambda in one pass. A dialect narrows the subset by adding rules, never
// by removing these.

/** @import * as A from "./ast.js" */

/**
 * @typedef {object} Context
 * @property {string} src
 * @property {A.Node[]} ancestors  Outermost first; the last is the node's parent.
 * @property {A.Node | null} parent
 * @property {string | null} key   The parent's property that holds this node.
 *
 * @typedef {{ code: string, message: string, tip: string, severity?: "error" | "warning", edits?: A.Edit[], range?: [number, number] }} Finding
 * @typedef {(node: A.Node, ctx: Context) => Finding | null} Rule
 */

/** @param {string} src @param {{ range: [number, number] }} n */
const text = (src, n) => src.slice(n.range[0], n.range[1]);

/**
 * Rewrites a template literal as string concatenation. Returns no edits for a
 * template nested in another, whose edits would overlap the outer one's.
 * @param {A.TemplateLiteral} t @param {Context} ctx @returns {A.Edit[] | undefined}
 */
function templateToConcat(t, ctx) {
  if (ctx.ancestors.some((a) => a.type === "TemplateLiteral")) return undefined;
  /** @type {string[]} */
  const parts = [];
  t.quasis.forEach((q, i) => {
    if (q.value.cooked !== "" || i === 0) parts.push(JSON.stringify(q.value.cooked));
    const e = t.expressions[i];
    if (e) parts.push(`(${text(ctx.src, e)})`);
  });
  return [{ range: t.range, text: parts.join(" + ") }];
}

/** The rules, in code order. @type {Array<{ code: string, rule: Rule }>} */
export const SUBSET_RULES = [
  { code: "S101", rule: (n) => n.type === "WhileStatement" || n.type === "DoWhileStatement"
    ? { code: "S101", message: `A ${n.type === "WhileStatement" ? "while" : "do…while"} loop has no bound the compiler can check.`, tip: "Use a counted loop with a known bound: for (let i = 0; i < N; i++) { … }." } : null },
  { code: "S102", rule: (n) => n.type === "NewExpression"
    ? { code: "S102", message: "new allocates at run time, which the targets cannot do.", tip: "Build the value at build time (in bake or a const), or use a type the dialect declares." } : null },
  { code: "S103", rule: (n) => n.type === "ThisExpression"
    ? { code: "S103", message: "this has no meaning in a runtime lambda.", tip: "Use the lambda's parameters instead, such as self or w." } : null },
  { code: "S104", rule: (n, ctx) => n.type === "TemplateLiteral"
    ? { code: "S104", message: "Template literals are not in the runtime subset.", tip: "Join strings with +; the fixit does it for you.", edits: templateToConcat(n, ctx) } : null },
  { code: "S105", rule: (n) => (n.type === "MemberExpression" || n.type === "CallExpression") && n.optional
    ? { code: "S105", message: "Optional chaining (?.) is not in the runtime subset.", tip: "Check for null first: if (x) { … x.y … }." } : null },
  { code: "S106", rule: (n) => n.type === "UnaryExpression" && (n.operator === "typeof" || n.operator === "void" || n.operator === "delete")
    ? { code: "S106", message: `${n.operator} is not in the runtime subset.`, tip: n.operator === "delete" ? "Entities and records have fixed fields; set the field to a value that means empty instead." : "Types are known at compile time; compare values directly instead." } : null },
  { code: "S107", rule: (n) => n.type === "BinaryExpression" && (n.operator === "in" || n.operator === "instanceof")
    ? { code: "S107", message: `${n.operator} is not in the runtime subset.`, tip: "Fields and types are fixed at compile time; test a declared field or kind instead." } : null },
  { code: "S108", rule: (n) => n.type === "SequenceExpression"
    ? { code: "S108", message: "The comma operator is not in the runtime subset.", tip: "Write each expression as its own statement." } : null },
  { code: "S109", rule: (n) => n.type === "SpreadElement"
    ? { code: "S109", message: "Spread (...) is not in the runtime subset.", tip: "List the elements or arguments explicitly." } : null },
  { code: "S110", rule: (n) => n.type === "VariableDeclaration" && n.kind === "var"
    ? { code: "S110", message: "var is not in the runtime subset.", tip: "Use let, or const if the value never changes; the fixit uses let.", edits: [{ range: [n.range[0], n.range[0] + 3], text: "let" }], range: [n.range[0], n.range[0] + 3] } : null },
  { code: "S111", rule: (n, ctx) => n.type === "ArrowFunctionExpression" && ctx.parent !== null && !(ctx.key === "arguments" && (ctx.parent.type === "CallExpression" || ctx.parent.type === "NewExpression"))
    ? { code: "S111", message: "A function defined inside a runtime lambda is a closure, which the targets cannot run.", tip: "Pass the arrow directly as a query argument (list.filter((m) => …)), or declare a helper in the dialect." } : null },
  { code: "S112", rule: (n) => n.type === "ForStatement" && n.test === null
    ? { code: "S112", message: "This for loop has no condition, so it has no bound.", tip: "Give the loop a condition with a known bound: for (let i = 0; i < N; i++)." } : null },
  { code: "S113", rule: (n) => n.type === "Property" && n.computed
    ? { code: "S113", message: "Computed object keys are not in the runtime subset.", tip: "Use a fixed key: { name: value }." } : null },
  { code: "S114", rule: (n) => n.type === "AssignmentPattern"
    ? { code: "S114", message: "Default values are not in the runtime subset.", tip: "Declare the default where the value is defined (a param or attr), or assign it with if." } : null },
  { code: "S116", rule: (n, ctx) => {
    if (n.type !== "BinaryExpression" || (n.operator !== "==" && n.operator !== "!=")) return null;
    const at = ctx.src.indexOf(n.operator, n.left.range[1]);
    return {
      code: "S116", severity: "warning", message: `Loose equality (${n.operator}) converts types before comparing.`,
      tip: `Use ${n.operator}= so both sides must have the same type; the fixit changes it.`,
      edits: at >= 0 && at < n.right.range[0] ? [{ range: [at, at + n.operator.length], text: `${n.operator}=` }] : undefined,
    };
  } },
];

/** Children of a node with the property that holds each. @param {A.Node} n @returns {Array<[A.Node, string]>} */
function children(n) {
  /** @type {Array<[A.Node, string]>} */
  const out = [];
  for (const [key, value] of Object.entries(n)) {
    if (key === "loc" || key === "range") continue;
    if (Array.isArray(value)) { for (const v of value) if (v && typeof v === "object" && "type" in v) out.push([v, key]); }
    else if (value && typeof value === "object" && "type" in value) out.push([/** @type {A.Node} */ (value), key]);
  }
  return out;
}

/** Converts a range to a loc using the source's line breaks. @param {string} src @param {[number, number]} range @returns {A.Loc} */
function locOf(src, range) {
  /** @param {number} off */
  const pos = (off) => {
    let line = 1, start = 0;
    for (let i = 0; i < off; i++) if (src[i] === "\n") { line++; start = i + 1; }
    return { line, column: off - start };
  };
  return { start: pos(range[0]), end: pos(range[1]) };
}

/**
 * Checks a parsed lambda against the runtime subset and returns every violation, in source order.
 * @param {A.ArrowFunctionExpression} ast
 * @param {string} src  The source `ast` was parsed from; fixits edit it.
 * @param {typeof SUBSET_RULES} [rules]
 * @returns {A.Diagnostic[]}
 */
export function checkSubset(ast, src, rules = SUBSET_RULES) {
  /** @type {A.Diagnostic[]} */
  const found = [];
  /** @param {A.Node} node @param {A.Node[]} ancestors @param {string | null} key */
  const visit = (node, ancestors, key) => {
    const ctx = { src, ancestors, parent: ancestors[ancestors.length - 1] ?? null, key };
    for (const { rule } of rules) {
      const f = rule(node, ctx);
      if (!f) continue;
      const range = f.range ?? node.range;
      /** @type {A.Diagnostic} */
      const d = { code: f.code, severity: f.severity ?? "error", message: f.message, tip: f.tip, loc: locOf(src, range), range };
      if (f.edits) d.edits = f.edits;
      found.push(d);
    }
    for (const [child, k] of children(node)) visit(child, [...ancestors, node], k);
  };
  visit(ast, [], null);
  return found.sort((a, b) => a.range[0] - b.range[0]);
}
