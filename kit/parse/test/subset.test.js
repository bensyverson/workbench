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

test("S110 var, with a fixit to let", () => {
  const src = "(a) => { var n = 1; return n; }";
  assert.equal(fixed(src, one(src, "S110")), "(a) => { let n = 1; return n; }");
});

test("S111 an arrow that is not a call argument", () => {
  const d = one("(w) => { const ok = (d) => d > 0; return ok(1); }", "S111");
  assert.match(d.tip, /helper|argument/);
});

test("S112 a for loop with no condition", () => { one("(a) => { for (;;) break; }", "S112"); });
test("S113 a computed object key", () => { one("(a) => ({ [a]: 1 })", "S113"); });
test("S114 a default value in a parameter or pattern", () => { one("({ k = 4 }) => k", "S114"); one("(a) => { const [x = 1] = a; return x; }", "S114"); });

test("S116 loose equality is a warning, with a fixit to strict equality", () => {
  const src = "(a) => a.x == 1 || a.y != 2";
  const ds = check(src);
  assert.deepEqual(ds.map((d) => [d.code, d.severity]), [["S116", "warning"], ["S116", "warning"]]);
  const out = applyEdits(src, ds.flatMap((d) => d.edits ?? []));
  assert.equal(out, "(a) => a.x === 1 || a.y !== 2");
});

test("applyEdits applies non-overlapping edits in any order and rejects overlaps", () => {
  assert.equal(applyEdits("abcdef", [{ range: [4, 5], text: "E" }, { range: [0, 1], text: "A" }]), "AbcdEf");
  assert.throws(() => applyEdits("abcdef", [{ range: [0, 3], text: "" }, { range: [2, 4], text: "" }]), /overlap/);
});
