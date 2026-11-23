import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda } from "../index.js";

/** @import { ArrowFunctionExpression, Expression, Statement } from "../ast.js" */

/** Parses `src` and fails the test with the diagnostics if it does not parse. @param {string} src */
function ok(src) {
  const r = parseLambda(src);
  if (!r.ok) assert.fail(`expected ${JSON.stringify(src)} to parse; got ${JSON.stringify(r.diagnostics.map((d) => `${d.code} ${d.message}`))}`);
  return r.ast;
}
/** The expression body of `(a, b) => <expr>`. @param {string} expr @returns {any} */
const expr = (expr) => /** @type {any} */ (ok(`(a, b) => ${expr}`).body);
/** The first statement of a block body. @param {string} body @returns {any} */
const stmt = (body) => /** @type {any} */ (ok(`(a, b) => { ${body} }`).body).body[0];

/** Strips loc and range so trees compare by shape. @param {unknown} n @returns {any} */
function shape(n) {
  if (Array.isArray(n)) return n.map(shape);
  if (n && typeof n === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && k !== "raw") out[k] = shape(v);
    return out;
  }
  return n;
}
/** Renders an expression tree as fully parenthesized text, to check precedence. @param {any} n @returns {string} */
function paren(n) {
  switch (n.type) {
    case "Identifier": return n.name;
    case "Literal": return JSON.stringify(n.value);
    case "BinaryExpression": case "LogicalExpression": case "AssignmentExpression": return `(${paren(n.left)} ${n.operator} ${paren(n.right)})`;
    case "UnaryExpression": return `(${n.operator}${n.operator.length > 1 ? " " : ""}${paren(n.argument)})`;
    case "UpdateExpression": return n.prefix ? `(${n.operator}${paren(n.argument)})` : `(${paren(n.argument)}${n.operator})`;
    case "ConditionalExpression": return `(${paren(n.test)} ? ${paren(n.consequent)} : ${paren(n.alternate)})`;
    case "MemberExpression": return n.computed ? `${paren(n.object)}[${paren(n.property)}]` : `${paren(n.object)}${n.optional ? "?." : "."}${n.property.name}`;
    case "CallExpression": return `${paren(n.callee)}(${n.arguments.map(paren).join(", ")})`;
    default: return `<${n.type}>`;
  }
}

test("parses arrow parameter forms", () => {
  assert.deepEqual(ok("x => x").params.map((p) => shape(p)), [{ type: "Identifier", name: "x" }]);
  assert.deepEqual(ok("() => 1").params, []);
  assert.equal(ok("(self, w) => 1").params.length, 2);
  const [ctx] = ok("({ k, w: world }) => k").params;
  assert.equal(ctx.type, "ObjectPattern");
  assert.deepEqual(shape(/** @type {any} */ (ctx).properties.map((/** @type {any} */ p) => [p.key.name, p.value.name, p.shorthand])), [["k", "k", true], ["w", "world", false]]);
  assert.equal(ok("([a, , b]) => a").params[0].type, "ArrayPattern");
});

test("distinguishes an expression body from a block body", () => {
  const e = ok("(self) => self.up");
  assert.equal(e.expression, true);
  assert.equal(e.body.type, "MemberExpression");
  const b = ok("(self) => { return 1; }");
  assert.equal(b.expression, false);
  assert.equal(b.body.type, "BlockStatement");
  assert.equal(ok("() => ({ x: 1 })").body.type, "ObjectExpression");
});

test("binary precedence and associativity follow JavaScript", () => {
  const cases = [
    ["a + b * 2", "(a + (b * 2))"],
    ["a - b - 1", "((a - b) - 1)"],
    ["a ** b ** 2", "(a ** (b ** 2))"],
    ["a << 1 | b & 3 ^ 4", "((a << 1) | ((b & 3) ^ 4))"],
    ["a < b === b >= a", "((a < b) === (b >= a))"],
    ["a && b || !a", "((a && b) || (!a))"],
    ["a ?? b", "(a ?? b)"],
    ["(w.frame >> 4) % 9 === a.index", "(((w.frame >> 4) % 9) === a.index)"],
    ["a ? b : a ? 1 : 2", "(a ? b : (a ? 1 : 2))"],
    ["a = b = 3", "(a = (b = 3))"],
    ["a.x += b * 2", "(a.x += (b * 2))"],
    ["-a ** 2 > 0 ? 1 : 0", "<parse-error>"],
  ];
  for (const [src, want] of cases) {
    const r = parseLambda(`(a, b) => ${src}`);
    if (want === "<parse-error>") { assert.equal(r.ok, false, src); continue; }
    assert.ok(r.ok, src);
    assert.equal(paren(/** @type {any} */ (r.ast).body), want, src);
  }
});

test("prefix and postfix updates, including inside expressions", () => {
  assert.equal(paren(expr("a.up && --a.ttl === 0")), "(a.up && ((--a.ttl) === 0))");
  assert.equal(paren(expr("a.rise--")), "(a.rise--)");
  assert.equal(paren(expr("!a.up")), "(!a.up)");
  assert.equal(paren(expr("typeof a")), "(typeof a)");
});

test("member, call and optional chains", () => {
  assert.equal(paren(expr("w.board.at(a.cell).x")), "w.board.at(a.cell).x");
  assert.equal(paren(expr("at(0, 1).text(\"T %02d\", w.secs)")), "at(0, 1).text(\"T %02d\", w.secs)");
  assert.equal(paren(expr("DIRS[w.dir][2]")), "DIRS[w.dir][2]");
  assert.equal(paren(expr("a?.b")), "a?.b");
  const call = expr("w.rng.pick(w.board.filter((m) => !m.up))");
  assert.equal(call.arguments[0].arguments[0].type, "ArrowFunctionExpression");
  assert.equal(expr("new Uint8Array(4)").type, "NewExpression");
});

test("literals: numbers in every notation, strings with escapes, booleans and null", () => {
  assert.deepEqual([expr("0x1F").value, expr("0b101").value, expr("0o17").value, expr("1e3").value, expr("1_000").value, expr(".5").value, expr("0.12").value], [31, 5, 15, 1000, 1000, 0.5, 0.12]);
  assert.equal(expr("'it\\'s'").value, "it's");
  assert.equal(expr('"a\\nb\\u0041"').value, "a\nbA");
  assert.deepEqual([expr("true").value, expr("false").value, expr("null").value], [true, false, null]);
  assert.equal(expr("undefined").type, "Identifier");
});

test("object and array literals, with shorthand and string keys", () => {
  const o = expr('({ cell: a.cell, b, "k": 1, 2: 3 })');
  assert.deepEqual(o.properties.map((/** @type {any} */ p) => [p.key.name ?? p.key.value, p.shorthand]), [["cell", false], ["b", true], ["k", false], [2, false]]);
  assert.equal(expr("[a, b, ...a]").elements[2].type, "SpreadElement");
  assert.equal(expr("[a, , b]").elements[1], null);
  assert.equal(expr("({ [a]: 1 })").properties[0].computed, true);
});

test("template literals keep their pieces", () => {
  const t = expr("`L ${a} of ${b + 1}`");
  assert.equal(t.type, "TemplateLiteral");
  assert.deepEqual(t.quasis.map((/** @type {any} */ q) => q.value.cooked), ["L ", " of ", ""]);
  assert.equal(t.expressions.length, 2);
});

test("statements: declarations, if/else, for, for…of, while, return, break, continue", () => {
  /** @type {any} */
  const decl = stmt("const [dx, dy] = DIRS[w.dir], n = 1;");
  assert.equal(decl.kind, "const");
  assert.equal(decl.declarations[0].id.type, "ArrayPattern");
  assert.equal(stmt("let { cx, cy } = w.bg.cell(1, 2);").declarations[0].id.type, "ObjectPattern");
  /** @type {any} */
  const iff = stmt("if (a) b = 1; else if (b) a = 2; else { a = 3; }");
  assert.equal(iff.alternate.type, "IfStatement");
  assert.equal(iff.alternate.alternate.type, "BlockStatement");
  /** @type {any} */
  const loop = stmt("for (let i = 0; i < w.param(\"burst\"); i++) { if (!a) break; }");
  assert.equal(loop.type, "ForStatement");
  assert.equal(loop.init.type, "VariableDeclaration");
  assert.equal(stmt("for (const p of [w.player, w.cpu]) a(p);").type, "ForOfStatement");
  assert.equal(stmt("for (;;) break;").test, null);
  assert.equal(stmt("while (a) a--;").type, "WhileStatement");
  assert.equal(stmt("do a--; while (a)").type, "DoWhileStatement");
  assert.equal(stmt("return;").argument, null);
  assert.equal(stmt("for (const x of a) continue;").body.type, "ContinueStatement");
  assert.equal(stmt(";").type, "EmptyStatement");
});

test("comments are skipped wherever they appear", () => {
  const a = ok("(self) => {\n  // a comment\n  if (self.up /* inline */ && --self.ttl === 0) self.up = false; // trailing\n}");
  assert.equal(/** @type {any} */ (a.body).body.length, 1);
});

test("automatic semicolon insertion at line ends, before }, and after return", () => {
  /** @type {any} */
  const body = ok("(w) => {\n  const a = 1\n  w.x = a\n  return\n  w.y\n}").body;
  assert.deepEqual(body.body.map((/** @type {Statement} */ s) => s.type), ["VariableDeclaration", "ExpressionStatement", "ReturnStatement", "ExpressionStatement"]);
  assert.equal(body.body[2].argument, null, "return followed by a newline returns nothing");
  assert.equal(ok("(w) => { w.x = 1 }").body.type, "BlockStatement");
  /** @type {any} */
  const post = ok("(a, b) => {\n  a\n  ++b\n}").body;
  assert.equal(post.body[1].expression.prefix, true, "++ after a newline starts the next statement");
});

test("spans: loc and range point at the source, lines 1-based and columns 0-based", () => {
  const src = "(self) => {\n  if (self.up) self.up = false;\n}";
  const a = ok(src);
  /** @type {any} */
  const iff = /** @type {any} */ (a.body).body[0];
  assert.deepEqual(iff.loc.start, { line: 2, column: 2 });
  assert.equal(src.slice(iff.range[0], iff.range[1]), "if (self.up) self.up = false;");
  const test0 = iff.test;
  assert.equal(src.slice(test0.range[0], test0.range[1]), "self.up");
  assert.deepEqual(a.loc.start, { line: 1, column: 0 });
  assert.deepEqual(a.loc.end, { line: 3, column: 1 });
});

test("the whole source must be one arrow function, and the result names the arrow", () => {
  /** @type {ArrowFunctionExpression} */
  const a = ok("  (x) => x  ");
  assert.equal(a.type, "ArrowFunctionExpression");
  /** @type {Expression} */
  const body = /** @type {Expression} */ (a.body);
  assert.equal(body.type, "Identifier");
});
