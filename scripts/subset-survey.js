// Counts which JavaScript constructs the DMG presets' runtime lambdas use, so the
// subset parser's grammar is chosen from evidence. Uses TypeScript's parser (a dev
// dependency) as a neutral reference; the kit's own parser never depends on it.
// Usage: node scripts/subset-survey.js [--presets 04,05,06,07] [--examples]
import ts from "typescript";
import { inventory } from "./dmg-oracle/inventory.js";

const args = process.argv.slice(2);
const only = args.includes("--presets") ? args[args.indexOf("--presets") + 1].split(",") : null;
const showExamples = args.includes("--examples");

/** Constructs worth deciding on, keyed by a readable name. @type {Record<string, (n: any, depth: number) => boolean>} */
const probes = {
  "nested arrow (callback)": (n, depth) => ts.isArrowFunction(n) && depth > 0,
  "callback capturing outer local": () => false, // filled below
  "for (;;)": (n) => ts.isForStatement(n),
  "for…of": (n) => ts.isForOfStatement(n),
  "while / do": (n) => ts.isWhileStatement(n) || ts.isDoStatement(n),
  "destructuring": (n) => ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n),
  "spread": (n) => ts.isSpreadElement(n) || ts.isSpreadAssignment(n),
  "array literal": (n) => ts.isArrayLiteralExpression(n),
  "object literal": (n) => ts.isObjectLiteralExpression(n),
  "string literal": (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n),
  "template with ${}": (n) => ts.isTemplateExpression(n),
  "computed member a[x]": (n) => ts.isElementAccessExpression(n) && !ts.isNumericLiteral(n.argumentExpression),
  "index a[0]": (n) => ts.isElementAccessExpression(n) && ts.isNumericLiteral(n.argumentExpression),
  "++/-- as expression": (n) => (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(n.operator) && !ts.isExpressionStatement(n.parent),
  "assignment as expression": (n) => ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && !ts.isExpressionStatement(n.parent),
  "ternary": (n) => ts.isConditionalExpression(n),
  "Math.*": (n) => ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Math",
  "method on array/string (.filter, .length …)": (n) => ts.isPropertyAccessExpression(n) && ["filter", "find", "reduce", "map", "some", "every", "forEach", "length", "repeat", "endsWith", "includes", "indexOf", "join", "slice", "push"].includes(n.name.text),
  "optional chaining ?.": (n) => !!(/** @type {any} */ (n).questionDotToken),
  "new": (n) => ts.isNewExpression(n),
  "regex": (n) => ts.isRegularExpressionLiteral(n),
  "this": (n) => n.kind === ts.SyntaxKind.ThisKeyword,
  "function keyword": (n) => ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n),
  "typeof / delete / in / instanceof": (n) => ts.isTypeOfExpression(n) || ts.isDeleteExpression(n) || (ts.isBinaryExpression(n) && [ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword].includes(n.operatorToken.kind)),
  "break / continue": (n) => ts.isBreakStatement(n) || ts.isContinueStatement(n),
  "switch": (n) => ts.isSwitchStatement(n),
  "free identifier (not param/local/known global)": () => false, // filled below
};
const KNOWN_GLOBALS = new Set(["Math", "undefined", "NaN", "Infinity", "Number", "String", "Boolean", "Object", "Array", "JSON"]);

const inv = inventory().filter((e) => !only || only.includes(e.preset));
/** @type {Record<string, { lambdas: number, presets: Set<string>, examples: string[] }>} */
const counts = {};
for (const k of Object.keys(probes)) counts[k] = { lambdas: 0, presets: new Set(), examples: [] };

for (const e of inv) {
  const sf = ts.createSourceFile("l.js", `(${e.src})`, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  /** @type {Set<string>} */
  const hit = new Set();
  /** @type {string[]} */
  const exampleText = [];
  // Scope tracking: names bound by params and declarations, per arrow depth.
  /** @type {Set<string>[]} */
  const scopes = [];
  const bound = (/** @type {string} */ name) => scopes.some((s) => s.has(name));
  /** @param {ts.BindingName} b @param {Set<string>} into */
  const bindNames = (b, into) => {
    if (ts.isIdentifier(b)) into.add(b.text);
    else for (const el of b.elements) if (!ts.isOmittedExpression(el)) bindNames(el.name, into);
  };
  /** @param {ts.Node} n @param {number} depth */
  const visit = (n, depth) => {
    for (const [name, probe] of Object.entries(probes)) if (probe(n, depth)) { hit.add(name); exampleText.push(`${name}: ${n.getText().slice(0, 70)}`); }
    if (ts.isArrowFunction(n)) {
      const s = new Set(); for (const p of n.parameters) bindNames(p.name, s);
      scopes.push(s); ts.forEachChild(n, (c) => visit(c, depth + 1)); scopes.pop(); return;
    }
    if (ts.isVariableDeclaration(n)) bindNames(n.name, scopes[scopes.length - 1]);
    if (ts.isIdentifier(n) && depth > 0) {
      const p = n.parent;
      const isProp = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || ts.isBindingElement(p) || ts.isVariableDeclaration(p) || ts.isParameter(p) || (ts.isShorthandPropertyAssignment(p) && false);
      if (!isProp && !bound(n.text) && !KNOWN_GLOBALS.has(n.text)) { hit.add("free identifier (not param/local/known global)"); exampleText.push(`free: ${n.text}`); }
      if (!isProp && depth > 1 && scopes.slice(0, -1).some((s) => s.has(n.text)) && !scopes[scopes.length - 1].has(n.text)) { hit.add("callback capturing outer local"); exampleText.push(`capture: ${n.text}`); }
    }
    ts.forEachChild(n, (c) => visit(c, depth));
  };
  visit(sf, 0);
  for (const h of hit) { counts[h].lambdas++; counts[h].presets.add(e.preset); }
  if (showExamples) for (const x of exampleText) { const [k] = x.split(":"); const c = counts[k] ?? counts["free identifier (not param/local/known global)"]; if (c && c.examples.length < 3) c.examples.push(`${e.preset} ${e.id} — ${x}`); }
}

console.log(`${inv.length} lambdas${only ? ` in presets ${only.join(",")}` : " in all presets"}\n`);
for (const [k, c] of Object.entries(counts).sort((a, b) => b[1].lambdas - a[1].lambdas)) {
  if (!c.lambdas) continue;
  console.log(`${String(c.lambdas).padStart(4)}  ${k.padEnd(46)} ${[...c.presets].join(" ")}`);
  for (const x of c.examples) console.log(`        ${x}`);
}
