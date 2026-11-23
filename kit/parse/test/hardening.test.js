// More of what the review found: the parser must not accept what JavaScript rejects,
// and the cases that were only covered by accident (the mutants the review ran).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda, checkSubset, applyEdits } from "../index.js";

/** Does real JavaScript accept `src` as one expression? (a sloppy script, like String(fn)) @param {string} src */
function jsAccepts(src) {
  try { new Function(`return ${src}\n;`); return true; } catch { return false; }
}
/** @param {string} src @param {...unknown} args */
const run = (src, ...args) => new Function(`return ${src}\n;`)()(...args);
/** Parses `src`, which must succeed. @param {string} src @returns {any} */
function ok(src) {
  const r = parseLambda(src);
  if (!r.ok) assert.fail(`expected ${JSON.stringify(src)} to parse; got ${r.diagnostics[0].code} ${r.diagnostics[0].message}`);
  return r.ast;
}
/** Both JavaScript and the parser must reject `src`; returns the diagnostic code. @param {string} src */
function rejected(src) {
  assert.equal(jsAccepts(src), false, `oracle: JS should reject ${JSON.stringify(src)}`);
  const r = parseLambda(src);
  assert.equal(r.ok, false, `parser accepted ${JSON.stringify(src)}`);
  return r.diagnostics[0].code;
}
/** Both JavaScript and the parser must accept `src`. @param {string} src */
function accepted(src) {
  assert.equal(jsAccepts(src), true, `oracle: JS should accept ${JSON.stringify(src)}`);
  return ok(src);
}
/** The body expression of `(a, b, c) => <expr>`. @param {string} e @returns {any} */
const body = (e) => ok(`(a, b, c) => ${e}`).body;
/** Fully parenthesized rendering of an expression tree. @param {any} n @returns {string} */
function paren(n) {
  switch (n.type) {
    case "Identifier": return n.name;
    case "Literal": return n.raw;
    case "BinaryExpression": case "LogicalExpression": return `(${paren(n.left)} ${n.operator} ${paren(n.right)})`;
    case "ConditionalExpression": return `(${paren(n.test)} ? ${paren(n.consequent)} : ${paren(n.alternate)})`;
    case "AssignmentExpression": return `(${paren(n.left)} ${n.operator} ${paren(n.right)})`;
    default: return n.type;
  }
}

// ---------- more over-acceptance ----------

test("duplicate parameters and redeclared names are rejected; legal shadowing stays legal", () => {
  for (const src of [
    "(a, a) => 1", "(a, [a]) => 1", "(a) => { let a }", "() => { let x; let x }", "() => { let x; var x }",
    "() => { var x; let x }", "(xs) => { for (let a, b of xs) {} }", "() => { let [a, a] = [1, 2] }",
    "() => { const x = 1; { var x } }",
  ]) rejected(src);
  for (const src of [
    "() => { let x; { let x } }", "(a) => { var a }", "() => { for (let i = 0; i < 2; i++) { let i } }", "() => { var x; var x }",
    "(a) => { { var b } let c }", "(a) => (a) => a", "() => { let x = () => { let x }; return x }", "(a) => { { let a } }",
  ]) accepted(src);
});

test("declarations without a required initializer, and lexical declarations as a single statement", () => {
  for (const src of ["() => { const x; }", "() => { let [a]; }", "(a) => { if (a) const x = 1 }", "(a) => { while (a) let x = 1 }", "(a) => { if (a) {} else let x = 1 }"]) rejected(src);
  accepted("(xs) => { for (const x of xs) {} }");
  accepted("() => { let x, y = 1; var z; }");
  accepted("(a) => { if (a) var x = 1 }");
});

test("for…in is P004 whatever its head, and `in` stays legal where JavaScript allows it", () => {
  for (const src of ["(o) => { for (x in o) {} }", "(o) => { for (const k in o) {} }", "(o) => { for (var k in o) {} }", "(o) => { for (o.k in o) {} }"]) {
    const r = parseLambda(src);
    assert.equal(r.ok, false, src);
    assert.equal(r.diagnostics[0].code, "P004", src);
    assert.match(r.diagnostics[0].message, /for…in/, src);
  }
  accepted("(o) => { for (let i = (\"a\" in o) ? 1 : 0; i < 2; i++) {} }");
  accepted("(o) => { for (let i = 0; i < 2; i++) if (\"a\" in o) break }");
  accepted("(o) => { for (let i = [\"a\" in o]; ; ) break }");
});

test("a trailing comma is legal in arrow parameters and arguments only where JavaScript allows it", () => {
  assert.equal(accepted("(a, b,) => 1").params.length, 2);
  assert.equal(accepted("(a,) => 1").params.length, 1);
  accepted("(f) => f(1, 2,)");
  for (const src of ["(a,)", "(,) => 1", "(a,,) => 1", "(a, b,)", "(a, ...b) => 1"]) assert.equal(parseLambda(src).ok, false, src);
  assert.equal(parseLambda("(x) => (a,)").ok, false);
});

test("async: a call to a function named async is an ordinary call; an async function is P004", () => {
  accepted("(a) => async(1)");
  accepted("(a) => async");
  accepted("async => 1");
  for (const src of ["async (a) => 1", "() => async () => 1", "() => async x => 1", "() => { async function f() {} }"]) {
    const r = parseLambda(src);
    assert.equal(r.ok, false, src);
    assert.equal(r.diagnostics[0].code, "P004", src);
  }
});

test("names inherited from Object.prototype are ordinary names everywhere", () => {
  const a = accepted("(constructor, toString) => ({ constructor, toString, __proto__: 1, hasOwnProperty: 2 })");
  assert.equal(a.params[0].type, "Identifier");
  assert.deepEqual(a.body.properties.map((/** @type {any} */ p) => [p.key.type, p.value.type]), [["Identifier", "Identifier"], ["Identifier", "Identifier"], ["Identifier", "Literal"], ["Identifier", "Literal"]]);
  const b = accepted("(w) => { let valueOf = 1; const { toString } = w; [constructor] = w; return valueOf + toString + hasOwnProperty }");
  assert.equal(b.body.body[3].argument.right.type, "Identifier");
  assert.equal(accepted("(w) => w.constructor.valueOf").body.property.type, "Identifier");
});

test("reserved words are property names but not variable names", () => {
  accepted("(a) => a.if + a.class + a.return");
  accepted("() => ({ if: 1, class: 2, null: 3 })");
  for (const src of ["(a) => a + if", "() => { let enum = 1 }", "() => { let let = 1 }", "() => { const { default: x } = {}; return else }", "() => ({ typeof })", "() => { let super }", "() => { for (let class of []) {} }", "(if) => 1", "if => 1"]) rejected(src);
  accepted("(a) => { for (const of of a) {} }");
  accepted("(of, async, get, set, yield) => of + async + get + set + yield".replace(", yield", "").replace(" + yield", ""));
});

test("malformed numbers, one by one", () => {
  for (const src of ["() => 1_", "() => 1__0", "() => 0x", "() => 0b", "() => 0o", "() => 1e", "() => 1e+", "() => 0b12", "() => 0o8", "() => 0xg", "() => 1_.5", "() => 1._5", "() => 0x_1", "() => 1e_1", "() => 1a", "() => 3in []"]) rejected(src);
});

test("numbers JavaScript accepts keep their value", () => {
  for (const [lit, v] of /** @type {Array<[string, number]>} */ ([["1_000", 1000], [".5", 0.5], ["5.", 5], ["5.e1", 50], ["0xFF", 255], ["0Xff", 255], ["0b101", 5], ["0B11", 3], ["0o17", 15], ["1e3", 1000], ["1E-3", 0.001], ["1e+3", 1000], ["1.5e1_0", 1.5e10], ["0", 0], ["0.5", 0.5], ["1_0.2_5", 10.25]])) {
    assert.equal(accepted(`() => ${lit}`).body.value, v, lit);
  }
});

test("`a?.5:1` is a conditional with a fractional number, not optional chaining", () => {
  const b = body("a?.5:1");
  assert.equal(b.type, "ConditionalExpression");
  assert.equal(b.consequent.value, 0.5);
});

test("an HTML-like comment is not supported, and not silently parsed as operators", () => {
  for (const src of ["(x, y) => x <!--y\n", "(x, y) => x\n--> y\n", "(x) => { x\n--> 1 }"]) {
    const r = parseLambda(src);
    assert.equal(r.ok, false, JSON.stringify(src));
    assert.equal(r.diagnostics[0].code, "P001");
  }
  accepted("(x) => { return x-- > 1 }");
  accepted("(x) => x < !x");
});

test("assignment through an optional chain is rejected, a parenthesized chain is not", () => {
  for (const src of ["(a) => { a?.b = 1 }", "(a) => { a?.b.c = 1 }", "(a) => { a?.[0].c += 1 }", "(a) => { a?.b.c-- }", "(a) => { ++a?.b }", "(a) => { a?.b().c = 1 }", "(a) => { [a?.b] = [1] }"]) rejected(src);
  accepted("(a) => { (a?.b).c = 1 }");
  accepted("(a) => { a.b.c = a?.b }");
});

test("an arrow is an assignment expression: not an operand, a test, a callee or a member object", () => {
  for (const src of ["(a) => a + (b) => b", "(a) => (b) => b + (c) => c", "() => () => {} + 1", "() => () => {}\n? 1 : 2", "() => () => {}.x", "() => -(a) => a", "() => new (a) => a", "() => () => {}++", "() => () => {} = 1"]) {
    if (jsAccepts(src)) continue;
    rejected(src);
  }
  accepted("(a) => (b) => b");
  accepted("(a) => (b) => b + 1");
  accepted("(a) => ((b) => b)(1)");
  accepted("(a) => ((b) => b) + 1");
  accepted("(w) => w.f((x) => x, (y) => y)");
  accepted("(a) => a ? (b) => b : (c) => c");
});

test("a block-bodied arrow ends its expression: the next line starts a new statement", () => {
  const b = accepted("(g) => { let f = (a) => { return a }\n[1].map(f)\nlet h = (a) => { return a }\n`x`\nreturn f }").body.body;
  assert.equal(b.length, 5);
  assert.equal(b[0].declarations[0].init.type, "ArrowFunctionExpression");
});

test("a shorthand initializer is only legal where the object becomes a pattern", () => {
  rejected("() => ({ k = 4 }).k");
  rejected("(f) => f([{ k = 4 }])");
  rejected("() => { let x = { k = 4 } }");
  accepted("(o) => { let k; ({ k = 4 } = o) }");
  accepted("({ k = 4 }) => k");
  accepted("([{ k = 4 }]) => k");
  accepted("(o) => { const { k = 4 } = o; for (const { j = 1 } of o) {} }");
  accepted("(o) => { let k; [{ k = 4 }] = o }");
});

test("parenthesized patterns are rejected; a parenthesized plain target is fine", () => {
  for (const src of ["((a)) => 1", "((a, b)) => 1", "(a, (b)) => 1", "([(a)]) => 1", "({ k: (a) }) => 1", "(x) => { let a; ([a]) = x }", "(x) => { let a; ({ a }) = x }", "(a.b) => 1", "(a = 1, (b) = 2) => 1"]) rejected(src);
  accepted("(x) => { let a; (a) = x }");
  accepted("(x) => { let a; [(a)] = x }");
  accepted("(x) => { (x.y) = 1 }");
  accepted("(x) => { let a; ({ k: (a) } = x) }");
});

test("an arrow parameter list and its patterns", () => {
  const a = accepted("([x, y], { k, j: m }, z = 1) => 1");
  assert.deepEqual(a.params.map((/** @type {any} */ p) => p.type), ["ArrayPattern", "ObjectPattern", "AssignmentPattern"]);
  accepted("({ a } = {}, [b] = []) => 1");
  rejected("(a.b) => 1");
  rejected("(1) => 1");
  rejected("(a + b) => 1");
});

// ---------- the lexer: unicode, line terminators, strings ----------

test("identifiers use the Unicode identifier classes, astral characters included", () => {
  accepted("(é, π, 𠮷) => é + π + 𠮷");
  accepted("(a) => { let ñ$_1 = a; return ñ$_1 }");
  for (const src of ["(a, b) => a×b", "(a, b) => a÷b", "(a, b) => a—b", "(a) => { let 😀 = a }", "(a) => a©"]) rejected(src);
});

test("whitespace and line terminators follow ECMAScript", () => {
  accepted("(a) => a　+ 1﻿");
  assert.equal(accepted("(a) => { return\ra }").body.body.length, 2, "CR ends the return");
  assert.equal(accepted("(a) => { return a }").body.body.length, 2, "U+2028 ends the return");
  assert.equal(accepted("(a) => { return a }").body.body.length, 2, "U+2029 ends the return");
  assert.equal(accepted("(a) => { return\r\na }").body.body.length, 2, "CRLF ends the return");
  assert.equal(accepted("(a) => { a\r++b }").body.body[1].expression.prefix, true);
  assert.equal(accepted("(a) => { a // c ++b }").body.body[1].expression.prefix, true, "U+2028 ends a line comment");
  assert.equal(accepted("(a) => a // c　+ 1").body.type, "Identifier", "U+3000 does not end a line comment");
  assert.equal(accepted("(a) => 1 + /* a\n b */ 2").type, "ArrowFunctionExpression");
});

test("loc counts \\n, \\r\\n, lone \\r, U+2028 and U+2029 as one line break each, across comments and templates", () => {
  for (const [name, nl] of [["LF", "\n"], ["CRLF", "\r\n"], ["CR", "\r"], ["LS", " "], ["PS", " "]]) {
    const src = `(a) => {${nl}  /* one${nl}two */ let x = \`p${nl}q\`; ${nl}  return x + 1${nl}}`;
    const ret = ok(src).body.body[1];
    assert.equal(src.slice(ret.range[0], ret.range[0] + 6), "return", name);
    assert.deepEqual(ret.loc.start, { line: 5, column: 2 }, name);
    assert.deepEqual(ok(src).loc.end, { line: 6, column: 1 }, name);
  }
});

test("a line comment and a block comment are both skipped without eating the next token", () => {
  assert.equal(accepted("(a) => a // x\n+ 1").body.type, "BinaryExpression");
  assert.equal(accepted("(a) => a /* x */ + 1").body.type, "BinaryExpression");
  assert.equal(accepted("(a, b) => { a /* x\n*/ ++b }").body.body.length, 2, "a line break inside a block comment counts for ASI");
  assert.equal(accepted("(a) => a /* x\n*/ + 1").body.type, "BinaryExpression");
});

test("string and template escapes decode as JavaScript does; bad escapes are P-codes", () => {
  const v = (/** @type {string} */ lit) => accepted(`() => ${lit}`).body.value;
  assert.equal(v('"\\x41\\x7a"'), "Az");
  assert.equal(v('"\\u0041\\u{1F600}\\u{41}"'), "A\u{1F600}A");
  assert.equal(v('"\\n\\t\\r\\b\\f\\v\\0"'), "\n\t\r\b\f\v\0");
  assert.equal(v('"a\\\nb"'), "ab");
  assert.equal(v('"a\\\r\nb"'), "ab");
  assert.equal(v('"a\\ b"'), "ab");
  assert.equal(v('"a b"'), "a b", "U+2028 is allowed inside a string");
  assert.equal(v("'\\''"), "'");
  assert.equal(v('"\\q"'), "q");
  for (const src of ['() => "\\x4"', '() => "\\xg0"', '() => "\\u12"', '() => "\\u{110000}"', '() => "\\u{}"', '() => "\\u{12"', '() => "\\u{zz}"', '() => "a\nb"', '() => "a\rb"', "() => `\\u{110000}`", "() => `\\x4`"]) {
    const code = rejected(src);
    assert.match(code, /^P00[12]$/, src);
  }
});

test("a template's cooked text normalizes line breaks like JavaScript, and its elements span only their text", () => {
  const t = accepted("(a) => `x\r\ny\rz\n${a}\\\r\nw`").body;
  assert.equal(t.quasis[0].value.cooked, "x\ny\nz\n");
  assert.equal(t.quasis[1].value.cooked, "w");
  const src = "(a) => `ab${a}cd${a}`";
  const q = ok(src).body.quasis;
  assert.deepEqual(q.map((/** @type {any} */ e) => src.slice(e.range[0], e.range[1])), ["ab", "cd", ""]);
  assert.deepEqual(q.map((/** @type {any} */ e) => e.value.raw), ["ab", "cd", ""]);
  assert.deepEqual(q[1].loc.start, { line: 1, column: 14 });
  assert.deepEqual(q[1].loc.end, { line: 1, column: 16 });
});

// ---------- parseLambda never throws ----------

test("parseLambda returns a diagnostic for every kind of bad input, including absurd nesting", () => {
  const inputs = ["", " ", "\u0000", "(", ")", "=>", "@", "#x", "\\u0061", "((((", "(a) =>", "`${", "`${a", "`${a}", '"\\', "/*", "//", "(a) => {", "(a) => { /*", "(a) => a ? b", "0x", "1e", "😀", "(a) => \\"];
  for (const src of inputs) {
    const r = parseLambda(src);
    assert.equal(r.ok, false, JSON.stringify(src));
    const d = r.diagnostics[0];
    assert.ok(d.range[0] >= 0 && d.range[0] <= d.range[1] && d.range[1] <= src.length, `${JSON.stringify(src)} range ${d.range}`);
    assert.ok(d.loc.start.line >= 1 && d.loc.end.line >= d.loc.start.line);
  }
  const deep = parseLambda(`() => ${"(".repeat(200000)}1${")".repeat(200000)}`);
  assert.equal(deep.ok, false);
  assert.equal(deep.diagnostics[0].code, "P001");
  assert.match(deep.diagnostics[0].message, /nest/i);
});

// ---------- spans (ESTree: a parenthesized node excludes its own parens, its parent starts at the paren) ----------

test("a parenthesized node's own range excludes the parentheses, and a parent starts at the first one", () => {
  const src = "(a, b) => ((a + b) * 2)";
  const mul = ok(src).body;
  assert.equal(src.slice(mul.range[0], mul.range[1]), "(a + b) * 2");
  assert.equal(src.slice(mul.left.range[0], mul.left.range[1]), "a + b");
  const lambda = ok(src);
  assert.equal(src.slice(lambda.range[0], lambda.range[1]), src);
  const cases = /** @type {Array<[string, (n: any) => any, string]>} */ ([
    ["(a) => (a).x", (n) => n, "(a).x"],
    ["(a) => ((a)).x", (n) => n, "((a)).x"],
    ["(a) => ((a)).x", (n) => n.object, "a"],
    ["(f) => (f)(1)", (n) => n, "(f)(1)"],
    ["(a) => (a) ? 1 : 2", (n) => n, "(a) ? 1 : 2"],
    ["(a, b) => (a) && b", (n) => n, "(a) && b"],
    ["(a, b) => ((a), b)", (n) => n, "(a), b"],
    ["(a) => (a)++", (n) => n, "(a)++"],
    ["(a) => (a)[0]", (n) => n, "(a)[0]"],
    ["(a, b) => (a) = b", (n) => n, "(a) = b"],
    ["(a, b) => (a + b) ? 1 : 2", (n) => n.test, "a + b"],
    ["(a, b) => a + (b)", (n) => n, "a + (b)"],
    ["(a, b) => a + (b)", (n) => n.right, "b"],
  ]);
  for (const [s, pick, want] of cases) {
    const b = /** @type {any} */ (ok(s).body);
    const n = pick(b);
    const sliced = s.slice(n.range[0], n.range[1]);
    assert.equal(sliced, want, s);
  }
});

test("a node's range lies inside its parent's, and loc matches range", () => {
  const src = "(a, b) => {\n  const [x, y] = [(a), (b) + 1];\n  return (x ? y : (a)) + `t${(b)}`;\n}";
  const posAt = (/** @type {number} */ off) => { const before = src.slice(0, off).split("\n"); return { line: before.length, column: before[before.length - 1].length }; };
  /** @param {any} n @param {any} parent */
  const walk = (n, parent) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) walk(x, parent); return; }
    if (typeof n.type !== "string") return;
    if (parent) assert.ok(n.range[0] >= parent.range[0] && n.range[1] <= parent.range[1], `${n.type} inside ${parent.type}`);
    assert.deepEqual(n.loc.start, posAt(n.range[0]), `${n.type} start`);
    assert.deepEqual(n.loc.end, posAt(n.range[1]), `${n.type} end`);
    for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range") walk(v, n);
  };
  walk(ok(src), null);
});

// ---------- fixits ----------

/** One pass of every S104 fixit in `src`. @param {string} src */
function templateFixed(src) {
  const edits = checkSubset(ok(src), src).filter((x) => x.code === "S104").flatMap((x) => x.edits ?? []);
  assert.ok(edits.length > 0, `${src} has an S104 fixit`);
  return applyEdits(src, edits);
}

test("the S104 fixit keeps meaning in every position, and parenthesizes only when it must", () => {
  const cases = /** @type {Array<[string, unknown]>} */ ([
    ["(b) => `a${b}`.length", 1], ["(b) => `${b}`[0]", 12], 
    ["(n) => 2 * `${n}${n}`", 3], ["(n) => -`${n}${n}`", 3], ["(n) => `${n}` + `${n}`", 3], ["(n) => !`${n}`", 0],
    ["(n) => `${n}` ? 1 : 2", 0], ["(n) => n ? `a${n}` : `b${n}`", 0], ["(n) => `a${n}` === \"a1\"", 1],
    ["(n) => { return `${n}b` }", 1], ["(n) => { let s = `${n}${n}`; return s }", 7], ["(n) => [`${n}x`, `y${n}`]", 1], ["(n) => ({ k: `${n}k` })", 1],
    ["(n) => `${n}${n}`.length + `${n}`.length", 10], ["(n) => `${n}` in { 1: 1 }", 1], ["(n) => (`a${n}`).length", 1],
    ["(n) => `${`${n}`}`", 5], ["(n) => `a${`b${n}c`}d`", 5], ["(n) => typeof `${n}${n}`", 1], ["(n) => `${n}` * 2", 4],
    ["(n) => n + `${n}`", 1], ["(n) => `${n}${n}` - 1", 5], ["(n) => `${n} ${(n + 1) * 2}`", 2], ["(n) => `${n}`", 4], ["(n) => ``", 4], ["(n) => `${n}${n}${n}`", 4],
    ["(n) => `a\\n\\`b${n}\\${`", 1], ["(n) => `$${n}`", 1], ["(n) => `${n}$`", 1], ["(n) => `{${n}}`", 1], ["(n) => ` ${n}`", 1],
  ]);
  for (const [src, arg] of cases) {
    // A template nested in a substitution needs a further pass; every pass keeps the meaning.
    let out = src;
    for (let pass = 0; pass < 4 && checkSubset(ok(out), out).some((d) => d.code === "S104"); pass++) {
      out = templateFixed(out);
      assert.deepEqual(run(out, arg), run(src, arg), `${JSON.stringify(src)} -> ${JSON.stringify(out)}`);
    }
    assert.deepEqual(checkSubset(ok(out), out).filter((d) => d.code === "S104"), [], `${out} has no template left`);
  }
  assert.equal(templateFixed("(w) => w.text(`LIVES ${w.lives} LEFT`)"), '(w) => w.text("LIVES " + (w.lives) + " LEFT")');
  assert.equal(templateFixed("(a) => `ready`"), '(a) => "ready"');
  assert.equal(templateFixed("(b) => `a${b}`.length"), '(b) => ("a" + (b)).length');
  assert.equal(templateFixed("(a) => `${a}b`"), '(a) => "" + (a) + "b"');
});

test("a template inside a substitution gets no edit of its own, and the outer fixit still applies", () => {
  const src = "(n) => `a${`b${n}`}c`";
  const ds = checkSubset(ok(src), src).filter((d) => d.code === "S104");
  assert.equal(ds.length, 2);
  assert.ok(ds[0].edits && ds[0].edits.length === 1);
  assert.equal(ds[1].edits, undefined);
  const edits = ds.flatMap((d) => d.edits ?? []);
  assert.doesNotThrow(() => applyEdits(src, edits));
});

test("every fixit leaves source that still parses, over a spread of lambdas", () => {
  for (const src of ["(w) => { var x = `a${w}`; return x }", "(w) => `${w.a}${w.b}` + `${w}`", "(w) => w.f(`${w}`, `${w}`)"]) {
    const ds = checkSubset(ok(src), src).filter((d) => d.edits);
    for (const d of ds) {
      const out = applyEdits(src, /** @type {NonNullable<typeof d.edits>} */ (d.edits));
      assert.equal(parseLambda(out).ok, true, out);
    }
  }
});

test("S116 and the other codes do not change when a fixit disappears", () => {
  const src = "(a, b) => a == b && a != b";
  const ds = checkSubset(ok(src), src);
  assert.deepEqual(ds.map((d) => d.code), ["S116", "S116"]);
  assert.deepEqual(ds.map((d) => src.slice(d.range[0], d.range[1])), ["a == b", "a != b"]);
});

// ---------- cases that only mutation testing exercised ----------

test("precedence: shifts, in/instanceof, ** associativity, ?? against the rest", () => {
  assert.equal(paren(body("a + b >>> c")), "((a + b) >>> c)");
  assert.equal(paren(body("a >>> b + c")), "(a >>> (b + c))");
  assert.equal(paren(body("a in b << c")), "(a in (b << c))");
  assert.equal(paren(body("a << b in c")), "((a << b) in c)");
  assert.equal(paren(body("a instanceof b << c")), "(a instanceof (b << c))");
  assert.equal(paren(body("a ** b ** c")), "(a ** (b ** c))");
  assert.equal(paren(body("a * b ** c")), "(a * (b ** c))");
  assert.equal(paren(body("a ?? b ?? c")), "((a ?? b) ?? c)");
  assert.equal(paren(body("(a ?? b) || c")), "((a ?? b) || c)");
  assert.equal(paren(body("a ?? (b || c)")), "(a ?? (b || c))");
  assert.equal(paren(body("a ?? b == c")), "(a ?? (b == c))");
  assert.equal(paren(body("a == b ?? c")), "((a == b) ?? c)");
  assert.equal(paren(body("a ?? b ? c : a")), "((a ?? b) ? c : a)");
  assert.equal(paren(body("a | b ?? c")), "((a | b) ?? c)");
  assert.equal(paren(body("a ? b = 1 : c")), "(a ? (b = 1) : c)");
  assert.equal(paren(body("a ? b : c = 1")), "(a ? b : (c = 1))");
  assert.equal(paren(body("a ? b ? 1 : 2 : c")), "(a ? (b ? 1 : 2) : c)");
  assert.equal(paren(body("a = b = c")), "(a = (b = c))");
});

test("?? mixed with || or && is rejected in either order and either operand, unless parenthesized", () => {
  for (const src of ["a ?? b || c", "a || b ?? c", "a ?? b && c", "a && b ?? c", "a ?? b || c ?? a", "a || b && c ?? a"]) rejected(`(a, b, c) => ${src}`);
  for (const src of ["(a ?? b) || c", "a || (b ?? c)", "(a || b) ?? c", "a ?? (b && c)", "a ?? b ?? c", "a || b && c || a", "a ?? b | c"]) accepted(`(a, b, c) => ${src}`);
});

test("a unary operator before ** needs parentheses", () => {
  rejected("(a, b) => -a ** b");
  rejected("(a, b) => !a ** b");
  accepted("(a, b) => (-a) ** b");
  accepted("(a, b) => a ** -b");
});

test("++ and -- across a line break start the next statement; return and break end at a line break", () => {
  const post = accepted("(a, b) => { a\n++b }").body.body;
  assert.equal(post.length, 2);
  assert.equal(post[1].expression.prefix, true);
  assert.equal(accepted("(a, b) => { a++\n++b }").body.body.length, 2);
  const r = accepted("(a) => { return\n1 }").body.body;
  assert.equal(r[0].argument, null);
  assert.equal(r.length, 2);
  const brk = accepted("(a) => { while (a) { break\n} }").body.body[0].body.body[0];
  assert.equal(brk.type, "BreakStatement");
  assert.equal(accepted("(a) => { for (;;) { break\nlet x = 1 } }").body.body[0].body.body.length, 2);
});

test("labels and unsupported statements are P004", () => {
  for (const src of ["(a) => { x: for (;;) {} }", "(a) => { for (;;) { break x } }", "(a) => { for (;;) { continue x } }", "(a) => { switch (a) {} }", "(a) => { try {} catch (e) {} }", "(a) => { throw a }", "(a) => { class A {} }", "(a) => { function f() {} }", "(a) => { with (a) {} }", "(a) => { debugger }"]) {
    assert.equal(parseLambda(src).diagnostics[0]?.code, "P004", src);
  }
  assert.equal(parseLambda("(a) => /x/").diagnostics[0].code, "P004");
  assert.equal(parseLambda("(a) => a`x`").diagnostics[0].code, "P004");
});

test("a member expression is not a binding; an assignment target may be one", () => {
  rejected("(a) => { let a.b = 1 }");
  rejected("(a, b) => { for (let a.b of []) {} }");
  accepted("(a) => { a.b = 1; a[0] = 2 }");
  accepted("(a) => { for (a.b of [1]) {} }");
});

test("diagnostics from checkSubset come in source order and the error range stays inside the source", () => {
  const src = "(a) => { while (a) a--; var x = new Foo(); return `${a}` }";
  const ds = checkSubset(ok(src), src);
  const starts = ds.map((d) => d.range[0]);
  assert.deepEqual(starts, [...starts].sort((x, y) => x - y));
  assert.ok(ds.length >= 4);
  for (const bad of ['(a) => "abc', "(a) => a +", "(a) => `a", "(a) => a /* x", "("]) {
    const r = parseLambda(bad);
    const d = r.diagnostics[0];
    assert.ok(d.range[1] <= bad.length, `${bad}: ${d.range}`);
    assert.ok(d.loc.end.column <= bad.length + 1);
  }
});

test("checkSubset sorts what dialect rules report, even when a parent's range starts late", () => {
  const src = "(a) => a + 1";
  const ast = ok(src);
  /** @type {import("../subset.js").Rule} */
  const lateParent = (n) => (n.type === "ArrowFunctionExpression" ? { code: "X1", message: "parent", tip: "tip", range: [11, 12] } : n.type === "Identifier" ? { code: "X2", message: "id", tip: "tip" } : null);
  const ds = checkSubset(ast, src, [{ code: "X", rule: lateParent }]);
  assert.deepEqual(ds.map((d) => d.code), ["X2", "X2", "X1"]);
  assert.deepEqual(ds.map((d) => d.range[0]), [1, 7, 11]);
});

test("checkSubset reports loc across every kind of line break", () => {
  const src = "(a) => {\r\n  var x = 1;\r  var y = 2;   var z = 3\n}";
  const ds = checkSubset(ok(src), src);
  assert.deepEqual(ds.map((d) => d.loc.start), [{ line: 2, column: 2 }, { line: 3, column: 2 }, { line: 4, column: 2 }]);
  assert.deepEqual(ds.map((d) => d.loc.end), [{ line: 2, column: 5 }, { line: 3, column: 5 }, { line: 4, column: 5 }]);
});

test("one more pass over the lexer's number and escape rules", () => {
  assert.match(parseLambda("() => 0b12").diagnostics[0].message, /followed directly/);
  assert.match(parseLambda("() => 12abc").diagnostics[0].message, /followed directly/);
  assert.equal(accepted("(a) => 1e+2 + 1e-2").body.left.value, 100);
  assert.equal(accepted("() => 0b101 + 0o17").body.left.value, 5);
  assert.equal(accepted("() => 0xdead_beef").body.value, 0xdeadbeef);
  assert.equal(accepted('() => "\\x41"').body.value, "A");
  assert.equal(parseLambda("() => 0b102").ok, false);
  assert.equal(parseLambda("() => 0o78").ok, false);
  assert.equal(parseLambda("() => 0b1f").ok, false);
  assert.equal(parseLambda("() => 0xfg").ok, false);
  const t = accepted("(a) => `x\r\ny\rz\n${a}`").body;
  assert.equal(t.quasis[0].value.raw, "x\ny\nz\n", "raw text is normalized like cooked text");
});

test("a block comment's line breaks are counted, and an unclosed one reports where it began", () => {
  const src = "(a) => { /* a\n\n b */ return a }";
  const ret = ok(src).body.body[0];
  assert.deepEqual(ret.loc.start, { line: 3, column: 6 });
  const r = parseLambda("(a) => /* never");
  assert.deepEqual(r.diagnostics[0].range, [7, 15]);
});

test("`in` is only blocked at the top of a for head", () => {
  accepted("(o, c) => { for (var i = c ? \"a\" in o : 0; i < 1; i++) {} }");
  accepted("(o) => { for (var i = o[\"a\" in o]; ; ) break }");
  accepted("(o) => { for (var i = Number(\"a\" in o), j = [\"b\" in o]; ; ) break }");
  accepted("(o) => { for (var i = { k: \"a\" in o }; ; ) break }");
  accepted("(o) => { for (var i = `${\"a\" in o}`; ; ) break }");
  accepted("(o) => { for (var i = (p) => { return \"a\" in p }; ; ) break }");
  const r = parseLambda("(o) => { for (let in o) {} }");
  assert.equal(r.diagnostics[0].code, "P004");
});

test("scope rules: var stops at the function, loop heads and blocks have their own scope", () => {
  accepted("() => { let x = 1; const f = () => { var x = 2; return x }; return f }");
  accepted("() => { for (let i = 0; i < 1; i++) {} let i = 1; return i }");
  accepted("() => { for (let i = 0; i < 1; i++) {} for (let i = 0; i < 1; i++) {} }");
  accepted("(xs) => { for (const x of xs) {} for (const x of xs) {} const x = 1 }");
  accepted("() => { { let a } { let a } let a }");
  rejected("() => { for (const i; ;) break }");
  rejected("() => { for (let [a]; ;) break }");
  rejected("() => { for (var i = 0, j; ;) { let i } let k; let k }");
  rejected("() => { { var x } let x }");
  rejected("() => { let x; { var x } }");
  rejected("() => { { { var x } } let x }");
});

test("the S104 fixit's exact text per position", () => {
  const cases = /** @type {Array<[string, string]>} */ ([
    ["(b) => `a`.length", '(b) => "a".length'],
    ["(f) => `${f}`(1)", '(f) => ("" + (f))(1)'],
    ["(n) => { let s = `${n}x`; return s }", '(n) => { let s = "" + (n) + "x"; return s }'],
    ["(n) => { return `${n}x` }", '(n) => { return "" + (n) + "x" }'],
    ["(n) => [`${n}x`]", '(n) => ["" + (n) + "x"]'],
    ["(n) => n ? `${n}x` : `y${n}`", '(n) => n ? "" + (n) + "x" : "y" + (n)'],
    ["(n) => `${n}x` ? 1 : 2", '(n) => "" + (n) + "x" ? 1 : 2'],
    ["(n) => (`${n}x`)", '(n) => ("" + (n) + "x")'],
    ["(n) => n + `${n}`", '(n) => n + ("" + (n))'],
    ["(o) => o[`k${o}`]", '(o) => o["k" + (o)]'],
    ["(n) => { n = `${n}x` }", '(n) => { n = "" + (n) + "x" }'],
  ]);
  for (const [src, want] of cases) assert.equal(templateFixed(src), want, src);
});

test("the loop and condition diagnostics keep their codes", () => {
  assert.deepEqual(checkSubset(ok("(a) => { for (;;) {} }"), "(a) => { for (;;) {} }").map((d) => d.code), ["S112"]);
});
