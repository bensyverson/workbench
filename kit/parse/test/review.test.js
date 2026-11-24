// Regression tests from the independent review of the first parser commit:
// what JavaScript rejects the parser must reject, trees must match JavaScript's,
// spans must slice to the node's own source, and fixits must keep meaning.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda, checkSubset, applyEdits } from "../index.js";

/** Does real JavaScript accept `src` as one expression? (sloppy script, like String(fn) of a closure) @param {string} src */
function jsAccepts(src) {
  try { new Function(`return ${src}\n;`); return true; } catch { return false; }
}
/** Runs a lambda source with real JS. */
/** @param {string} src @param {...unknown} args */
const run = (src, ...args) => new Function(`return ${src}\n;`)()(...args);

/** The parser must never accept what JS rejects. @param {string} src */
function rejectsLikeJs(src) {
  assert.equal(jsAccepts(src), false, `oracle: JS should reject ${JSON.stringify(src)}`);
  /** @type {import("../ast.js").ParseResult | undefined} */
  let r;
  assert.doesNotThrow(() => { r = parseLambda(src); }, `parseLambda threw on ${JSON.stringify(src)}`);
  assert.equal(r?.ok, false, `parser accepted ${JSON.stringify(src)}, which JS rejects`);
}

// ---------- parseLambda must never throw ----------

test("F1 parseLambda never throws: error in the very first token", () => {
  for (const src of ['"abc', "/* x", "`abc", '"\\u{110000}"', '() => "\\u{110000}"', '() => "\\u{"']) {
    assert.doesNotThrow(() => parseLambda(src), JSON.stringify(src));
  }
});

// ---------- accepts what JS rejects ----------

test("F2 ?? mixed with || or && without parentheses is a syntax error", () => {
  for (const src of ["(a, b, c) => a ?? b || c", "(a, b, c) => a || b ?? c", "(a, b, c) => a ?? b && c", "(a, b, c) => a && b ?? c"]) rejectsLikeJs(src);
});

test("F3 identifiers made of non-identifier Unicode (×, —, emoji, U+2028)", () => {
  for (const src of ["(a, b) => a×b", "(a, b) => a—b", "(a) => { let 😀 = a; return 😀 }"]) rejectsLikeJs(src);
});

test("F4 reserved words used as binding names or identifiers", () => {
  for (const src of ["() => { let if = 1; return 1 }", "(if) => 1", "() => { const x = { return }; return x }", "() => { let in = 1 }"]) rejectsLikeJs(src);
});

test("F5 parenthesized patterns: ((a)) => 1, ([a]) = x, ({a}) = x", () => {
  for (const src of ["((a)) => 1", "(a, (b)) => 1", "(x) => { let a; ([a]) = x }", "(x) => { let a; ({a}) = x }"]) rejectsLikeJs(src);
});

test("F6 a shorthand initializer { k = 4 } outside a pattern", () => {
  for (const src of ["() => ({ k = 4 })", "(f) => f({ k = 4 })"]) rejectsLikeJs(src);
});

test("F7 a line break before =>", () => {
  for (const src of ["(a)\n=> 1", "a\n=> 1", "(w) => w.f((x)\n=> x)"]) rejectsLikeJs(src);
});

test("F8 an arrow as a binary operand or a callee", () => {
  for (const src of ["(a) => a + (b) => b", "(w) => w.f((x) => {}(1))", "(a) => a || (b) => b"]) rejectsLikeJs(src);
});

test("F9 numeric literals JS rejects", () => {
  for (const src of ["() => 1_", "() => 1__0", "() => 0x", "() => 1e", "() => 1e+", "() => 1_.5", "() => 0_1"]) rejectsLikeJs(src);
});

test("F10 assignment through an optional chain", () => {
  for (const src of ["(a) => { a?.b.c = 1 }", "(a) => { a?.b.c++ }"]) rejectsLikeJs(src);
});

test("F11 const without initializer, lexical declaration as a single statement, for-of with initializer", () => {
  for (const src of ["() => { const x; }", "(a) => { if (a) let x = 1 }", "(xs) => { for (let x = 1 of xs) {} }"]) rejectsLikeJs(src);
});

// ---------- parses differently from JS (wrong tree) ----------

test("F12 names inherited from Object.prototype become Literals (toString, valueOf, constructor…)", () => {
  const r = parseLambda("(w) => { let valueOf = 1; return valueOf + 1 }");
  assert.ok(r.ok);
  const ret = /** @type {any} */ (r.ast).body.body[1].argument.left;
  assert.equal(ret.type, "Identifier", `got ${ret.type} with value ${String(ret.value)}`);
});

test("F12b a parameter or statement named after an Object.prototype member is rejected", () => {
  assert.equal(parseLambda("(constructor) => constructor").ok, true, "JS accepts this");
  const r = parseLambda("(w) => { toString(w) }");
  assert.equal(r.ok, true, `JS accepts this; got ${r.diagnostics?.[0]?.message}`);
});

test("F13 legacy octal literals and escapes are rejected with a P-code, not decoded", () => {
  for (const src of ["() => 010", '() => "\\1"', '() => "\\01"', "() => 08", '() => "\\08"', '() => "\\9"', "() => `\\1`"]) {
    const r = parseLambda(src);
    assert.equal(r.ok, false, src);
    assert.match(r.diagnostics[0].code, /^P00\d$/, src);
    assert.match(r.diagnostics[0].message, /octal|escape|leading zero/i, src);
  }
  // What must still work.
  assert.equal(/** @type {any} */ (parseLambda('() => "\\0"').ast).body.value, "\0");
  assert.equal(/** @type {any} */ (parseLambda("() => 0").ast).body.value, 0);
  assert.equal(/** @type {any} */ (parseLambda("() => 0.5").ast).body.value, 0.5);
  assert.equal(/** @type {any} */ (parseLambda("() => 0o17").ast).body.value, 15);
});

test("F14 HTML-like comment <!-- is a comment in sloppy scripts", () => {
  const src = "(x, y) => x <!--y\n";
  assert.equal(run(src, 1, 2), 1);
  const r = parseLambda(src);
  if (r.ok) assert.equal(/** @type {any} */ (r.ast).body.type, "Identifier", "the body is just x");
});

test("F15 an arrow with a block body is not a callee: the next line's ( starts a new statement", () => {
  const src = "(g) => { let f = (a) => { return a }\n(g)\nreturn f }";
  assert.equal(jsAccepts(src), true);
  const r = parseLambda(src);
  assert.ok(r.ok);
  const body = /** @type {any} */ (r.ast).body.body;
  assert.equal(body.length, 3, `got ${body.length} statements; first init is ${body[0].declarations[0].init.type}`);
});

// ---------- spans ----------

/** Every expression node's slice must be the node's exact source: here, a parenthesized test. */
/** @param {string} src @param {{ range: [number, number] }} n */
function sliceOf(src, n) { return src.slice(n.range[0], n.range[1]); }

test("F16 a node whose left operand is parenthesized starts inside the parenthesis", () => {
  for (const [src, want] of [["(a, b) => (a + b) * 2", "(a + b) * 2"], ["(a) => (a).x", "(a).x"], ["(f) => (f)(1)", "(f)(1)"], ["(a) => (a) ? 1 : 2", "(a) ? 1 : 2"]]) {
    const r = parseLambda(src);
    assert.ok(r.ok);
    assert.equal(sliceOf(src, /** @type {any} */ (r.ast).body), want, src);
  }
});

// ---------- fixits ----------

test("F17 the S104 fixit must keep precedence: template inside a member access or a tighter operator", () => {
  for (const [src, arg] of /** @type {Array<[string, number]>} */ ([
    ["(b) => `a${b}`.length", 1],
    ["(a) => `${a}x` === \"1x\"", 1],
    ["(n) => 2 * `${n}${n}`", 1],
    ["(n) => -`${n}${n}`", 1],
  ])) {
    const r = parseLambda(src);
    assert.ok(r.ok, src);
    const d = checkSubset(r.ast, src).find((x) => x.code === "S104");
    const out = applyEdits(src, d?.edits ?? []);
    assert.deepEqual(run(out, arg), run(src, arg), `${src} -> ${out}`);
  }
});

test("F18 the S104 fixit with CRLF or a legacy-octal escape in the text", () => {
  for (const src of ["(a) => `x\r\ny${a}`", "(a) => `x\\\r\ny${a}`"]) {
    const r = parseLambda(src);
    if (!r.ok) continue; // rejecting is acceptable
    const d = checkSubset(r.ast, src).find((x) => x.code === "S104");
    const out = applyEdits(src, d?.edits ?? []);
    assert.equal(run(out, 1), run(src, 1), `${JSON.stringify(src)} -> ${JSON.stringify(out)}`);
  }
});

test("F19 the S110 fixit (var -> let) is withheld when var's function scope is used", () => {
  const src = "(c) => { if (c) { var x = 1 } return x }";
  const r = parseLambda(src);
  assert.ok(r.ok);
  const d = checkSubset(r.ast, src).find((x) => x.code === "S110");
  const out = applyEdits(src, d?.edits ?? []);
  let after;
  try { after = run(out, true); } catch (e) { after = `throws ${/** @type {Error} */ (e).name}`; }
  assert.equal(after, run(src, true), `${src} -> ${out}`);
});

// `x == null` was a case here; since 62bec66 `x != null` / `x == null` is the kit's null check, so S116 no longer
// warns on a comparison with a null literal (subset.test.js). `== undefined` is the same test and still warns.
test("F20 S116 keeps its warning and tip but offers no fixit: == undefined is not === undefined", () => {
  for (const src of ["(x) => x == undefined", "(x) => x != 1", "(a, b) => a /* a==b */ == b"]) {
    const r = parseLambda(src);
    assert.ok(r.ok);
    const d = checkSubset(r.ast, src).find((x) => x.code === "S116");
    assert.ok(d, src);
    assert.equal(d.severity, "warning");
    assert.ok(d.tip.length > 10);
    assert.equal(d.edits, undefined, "no fixit");
  }
});

test("F16b the S104 fixit over a parenthesized substitution emits unbalanced source (span bug F16)", () => {
  const src = "(a, b) => `sum ${(a + b) * 2}`";
  const r = parseLambda(src);
  const d = checkSubset(/** @type {any} */ (r.ast), src).find((x) => x.code === "S104");
  const out = applyEdits(src, d?.edits ?? []);
  assert.equal(run(out, 1, 2), run(src, 1, 2), out);
});

test("F22 CR, U+2028 and U+2029 are line terminators; U+3000 is whitespace", () => {
  for (const [src, arg] of /** @type {Array<[string, number]>} */ ([["(a) => { return\ra }", 5], ["(a) => { return a }", 5], ["(a) => a // c  + 1", 5], ["(a) => a　+ 1", 5]])) {
    const r = parseLambda(src);
    if (!r.ok) continue; // rejecting is acceptable; a different tree is not
    const want = run(src, arg);
    const body = /** @type {any} */ (r.ast).body;
    const got = body.type === "BlockStatement" ? (body.body[0].argument === null ? undefined : "returns a value") : body.type === "BinaryExpression" ? want : body.type === "Identifier" && body.name === "a" ? 5 : "other";
    assert.equal(got, want, `${JSON.stringify(src)} parsed as ${JSON.stringify(body, (k, v) => (k === "loc" || k === "range" ? undefined : v))}`);
  }
});
