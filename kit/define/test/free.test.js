// The free-name rule (B008): holes found in review through the generated field() builder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { field } from "../../dialects/fields/index.js";
import { parseLambda } from "../../parse/index.js";
import { freeNames } from "../free.js";

const codes = (/** @type {string} */ src) => field("c").pixel(src).check().map((/** @type {any} */ d) => d.code);
const free = (/** @type {string} */ src) => { const r = parseLambda(src); assert.ok(r.ok, `${src}: ${JSON.stringify(r.diagnostics?.[0])}`); return freeNames(r.ast).map((x) => x.name); };

const MUST_FLAG = [
  ["nested arrow's param read outside it", "(uv, u) => { const f = (k) => k; return color(k, 0, 0); }", "k"],
  ["block-scoped const read after the block", "(uv, u) => { if (uv.x > 0) { const t = 1; } return color(t, 0, 0); }", "t"],
  ["for-of variable read after the loop", "(uv, u) => { for (const q of [1, 2]) { } return color(q, 0, 0); }", "q"],
  ["for counter read after the loop", "(uv, u) => { for (let i = 0; i < 2; i++) { } return color(i, 0, 0); }", "i"],
  ["assignment to an undeclared name", "(uv, u) => { Z = 1; return color(0, 0, 0); }", "Z"],
  ["destructuring default reads a free name", "(uv, u) => { const { x = Q } = uv; return color(x, 0, 0); }", "Q"],
  ["param default reads a free name", "(uv, u, k = Q) => color(k, 0, 0)", "Q"],
  ["computed key in a destructuring pattern", "(uv, u) => { const { [Q]: v } = uv; return color(v, 0, 0); }", "Q"],
  ["template literal", "(uv, u) => { const s = `${Q}`; return color(0, 0, 0); }", "Q"],
  ["spread", "(uv, u) => color(...Q)", "Q"],
  ["computed member", "(uv, u) => color(uv[Q], 0, 0)", "Q"],
];

for (const [what, src, n] of MUST_FLAG) {
  test(`free: ${what}`, () => {
    let names;
    try { names = free(src); } catch (e) { console.log("PARSER REFUSES", what); return; }
    assert.ok(names.includes(n), `${src} -> free ${JSON.stringify(names)}`);
  });
}

const MUST_PASS = [
  ["shadowing a param in a nested arrow", "(uv, u) => { const f = (uv) => uv; return color(f(1), 0, 0); }"],
  ["destructured param", "({ x, y }, u) => color(x, y, 0)"],
  ["object key not read", "(uv, u) => { const o = { Q: 1 }; return color(o.Q, 0, 0); }"],
];
for (const [what, src] of MUST_PASS) test(`bound: ${what}`, () => assert.deepEqual(free(src).filter((n) => n !== "color" && n !== "f"), []));

test("B008 on field() for an unknown free name after a block", () => {
  assert.ok(codes("(uv, u) => { if (uv.x > 0) { const t = 1; } return color(t, 0, 0); }").includes("B008"));
});

const tipOf = (/** @type {string} */ src) => /** @type {any} */ (field("c").pixel(src).check().find((/** @type {any} */ d) => d.code === "B008"));

test("B008 for Math.sin names the bare intrinsic, not a Program const", () => {
  const d = tipOf("(uv, u) => color(Math.sin(uv.x), 0, 0)");
  assert.match(d.tip, /\bsin\b/);
  assert.doesNotMatch(d.tip, /const|declare/);
});

test("B008 for a global with no bare intrinsic says it is not in the language", () => {
  const d = tipOf("(uv, u) => color(Math.hypot(uv.x, uv.y), 0, 0)");
  assert.match(d.tip, /Math is not in the language/);
  assert.doesNotMatch(d.tip, /const/);
  assert.match(tipOf("(uv, u) => { console.log(uv.x); return color(0, 0, 0); }").tip, /console is not in the language/);
});

test("B008 for an ordinary free name keeps its tip", () => {
  assert.match(tipOf("(uv, u) => color(zzz, 0, 0)").message, /zzz/);
});
