import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLambda, checkSubset, applyEdits } from "../index.js";

/** @import { Diagnostic } from "../ast.js" */

/** Parses and checks `src`; returns the subset diagnostics. @param {string} src @returns {Diagnostic[]} */
function check(src) {
  const r = parseLambda(src);
  if (!r.ok) assert.fail(`${src} did not parse: ${r.diagnostics[0].message}`);
  return checkSubset(r.ast, src);
}
/** Expects exactly one diagnostic with `code`, with a one-line tip; returns it. @param {string} src @param {string} code */
function one(src, code) {
  const ds = check(src);
  assert.equal(ds.length, 1, `${src}: ${JSON.stringify(ds.map((d) => d.code))}`);
  const d = ds[0];
  assert.equal(d.code, code, src);
  assert.ok(d.tip.length > 10 && !d.tip.includes("\n"), `${code} tip: ${d.tip}`);
  assert.ok(src.slice(d.range[0], d.range[1]).length > 0, "points at source");
  return d;
}
/** Applies the diagnostic's edits and returns the new source, which must check clean. @param {string} src @param {Diagnostic} d */
function fixed(src, d) {
  assert.ok(d.edits && d.edits.length, `${d.code} offers a fixit`);
  const out = applyEdits(src, d.edits);
  assert.deepEqual(check(out).map((x) => x.code), [], `fixed source checks clean: ${out}`);
  return out;
}

test("the whack-a-mole idiom is inside the subset", () => {
  assert.deepEqual(check("(w) => { const m = w.rng.pick(w.board.filter((m) => !m.up)); if (m) { m.up = true; m.ttl = 90; } }"), []);
  assert.deepEqual(check("(self) => { if (self.up && --self.ttl === 0) self.up = false; }"), []);
  assert.deepEqual(check("(w, e) => { for (let i = 0; i < w.param(\"burst\"); i++) { const s = w.spawn(\"sparks\", { x: e.x }); if (!s) break; } }"), []);
  assert.deepEqual(check("(w) => { const [dx, dy] = DIRS[w.dir]; for (const p of [w.player, w.cpu]) p.x += dx; }"), []);
});

test("reports every violation at once, in source order", () => {
  const ds = check("(a) => { var x = new Foo(); while (x) x--; }");
  assert.deepEqual(ds.map((d) => d.code), ["S110", "S102", "S101"]);
});

test("S101 while and do loops", () => {
  assert.match(one("(a) => { while (a) a--; }", "S101").tip, /for/);
  one("(a) => { do a--; while (a) }", "S101");
});

test("S102 new", () => { one("(a) => new Uint8Array(4)", "S102"); });
test("S103 this", () => { one("(a) => this.x", "S103"); });

test("S104 template literal, with a fixit to concatenation", () => {
  const src = "(w) => w.text(`LIVES ${w.lives} LEFT`)";
  const d = one(src, "S104");
  assert.equal(fixed(src, d), '(w) => w.text("LIVES " + (w.lives) + " LEFT")');
  const plain = "(w) => `ready`";
  assert.equal(fixed(plain, one(plain, "S104")), '(w) => "ready"');
});

test("S105 optional chaining", () => { one("(a) => a?.b", "S105"); one("(a) => a.f?.()", "S105"); });

test("S106 typeof, void and delete", () => {
  for (const op of ["typeof a", "void a", "delete a.b"]) one(`(a) => ${op}`, "S106");
});

test("S107 in and instanceof", () => { one('(a) => "x" in a', "S107"); one("(a) => a instanceof Array", "S107"); });
test("S108 comma operator", () => { one("(a) => (a.x = 1, a.y = 2)", "S108"); });
test("S109 spread", () => { one("(a) => [...a]", "S109"); one("(a) => f(...a)", "S109"); });

test("S110 var, with a fixit to let only when that is safe", () => {
  const src = "(a) => { var n = 1; return n; }";
  assert.equal(fixed(src, one(src, "S110")), "(a) => { let n = 1; return n; }");
  assert.equal(fixed("(a) => { var x = 1, [y, z] = a; return x }", one("(a) => { var x = 1, [y, z] = a; return x }", "S110")), "(a) => { let x = 1, [y, z] = a; return x }");
  // Each of these is an error with a tip and no edit: let would change what the lambda means or not compile.
  for (const unsafe of [
    "(c) => { if (c) { var x = 1 } return x }",       // nested in an if
    "(c) => { for (var i = 0; i < c; i++) {} return i }", // a for head
    "(c) => { for (var k of c) {} return k }",
    "(c) => { { var x = 1 } return x }",              // a nested block
    "(c) => { if (c) var x = 1; return x }",          // not in a block at all
    "(c) => { x = 1; var x; return x }",               // used before the declaration
    "(c) => { c(() => x); var x = 1; return c }",    // a closure earlier in source reads it
    "(c) => { var x = x + 1; return x }",              // read in its own initializer
    "(c) => { var x = 1; var x = 2; return x }",       // declared twice
    "(x) => { var x = 1; return x }",                  // a parameter of the same name
    "(c) => { var [a, b] = c, a2 = a; var a = 1 }",   // declared twice, by a pattern
  ]) {
    const ds = check(unsafe).filter((d) => d.code === "S110");
    assert.ok(ds.length >= 1, unsafe);
    for (const d of ds) {
      assert.equal(d.severity, "error");
      assert.ok(d.tip.length > 10, unsafe);
    }
    const first = ds[0];
    assert.equal(first.edits, undefined, `${unsafe} gets no fixit`);
  }
});

test("S110 safe fixit keeps meaning when the name is only used after the declaration, including in a later closure", () => {
  const src = "(c) => { var x = 1; c(() => x); return x }";
  const ds = check(src).filter((d) => d.code === "S110");
  assert.equal(applyEdits(src, ds[0].edits ?? []), "(c) => { let x = 1; c(() => x); return x }");
  const prop = "(c) => { var x = 1; return c.x + { x: 2 }.x }";
  assert.equal(applyEdits(prop, check(prop).filter((d) => d.code === "S110")[0].edits ?? []), "(c) => { let x = 1; return c.x + { x: 2 }.x }", "property names are not references");
  const earlierProp = "(c) => { c.x = { x: 1 }; var x = 1; return x }";
  assert.ok(check(earlierProp).filter((d) => d.code === "S110")[0].edits, "an earlier property named x is not a use of x");
  const short = "(c) => { const o = { x }; var x = 1; return o }";
  assert.equal(check(short).filter((d) => d.code === "S110")[0].edits, undefined, "a shorthand property reads the variable");
});

test("S111 an arrow that is not a call argument", () => {
  const d = one("(w) => { const ok = (d) => d > 0; return ok(1); }", "S111");
  assert.match(d.tip, /helper|argument/);
});

test("S112 a for loop with no condition", () => { one("(a) => { for (;;) break; }", "S112"); });
test("S113 a computed object key", () => { one("(a) => ({ [a]: 1 })", "S113"); });
test("S114 a default value in a parameter or pattern", () => { one("({ k = 4 }) => k", "S114"); one("(a) => { const [x = 1] = a; return x; }", "S114"); });

// Changed from "with a fixit to strict equality": `x == null` also matches undefined, so
// rewriting to === changes meaning. Ben ruled (2026-11-23) the warning and tip stay, the fixit goes.
test("S116 loose equality is a warning with a tip and no fixit", () => {
  const src = "(a) => a.x == 1 || a.y != 2";
  const ds = check(src);
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S116", "warning"], ["S116", "warning"]]);
  assert.ok(ds.every((d) => d.tip.length > 10 && d.edits === undefined));
});

test("applyEdits applies non-overlapping edits in any order and rejects overlaps", () => {
  assert.equal(applyEdits("abcdef", [{ range: [4, 5], text: "E" }, { range: [0, 1], text: "A" }]), "AbcdEf");
  assert.throws(() => applyEdits("abcdef", [{ range: [0, 3], text: "" }, { range: [2, 4], text: "" }]), /overlap/);
});

// `x != null` is the kit's null check, matching null and undefined both (kit/lower/README.md), so a loose
// comparison with a null literal is not S116; any other loose comparison still is.
test("S116 exempts a loose comparison with null", () => {
  assert.deepEqual(check("(a) => a == null || null != a.x").filter((d) => d.code === "S116"), []);
  assert.deepEqual(check("(a) => a == undefined || a.x != 0").map((d) => d.code).filter((c) => c === "S116"), ["S116", "S116"]);
});
