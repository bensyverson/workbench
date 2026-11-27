// @ts-nocheck: the fixture Grammar is built at run time, so its builder chains are untyped.
// A glue program loaded by the kit, not the host (review M2 and M4.4): rewriteGlue resolves its imports to the URLs
// the host made, and callGlue calls its default export with the glue's `$`, which has no params (a part keeps its
// own), so a build-time read is S104 instead of undefined, and turns whatever went wrong into S codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, rewriteGlue, callGlue, COMPOSE_CODES } from "../index.js";
import { name, data } from "../../define/index.js";
import { tiny } from "../../run/test/helpers.js";

const PARAM = { kind: "decl", args: [name("param"), data({ value: "number", min: "number", max: "number" })], as: "params" };
const W = tiny("w", { state: { size: "f64", t: "f64" }, inputs: false, ports: { out: {}, in: {} }, slots: { param: PARAM, label: { kind: "decl", args: [data("string")] } } }, {
  clock: () => ({ tick: 1 / 4 }), init: (r) => ({ size: r.size ?? -1, t: 0 }), step: (s, ctx) => ({ size: s.size, t: s.t + ctx.dt }),
});
const g = W.grammar;
const URLS = { "kit/compose": "blob:compose", "kit/define": "blob:define", maze: "blob:maze" };

test("rewriteGlue puts each import's URL where its specifier was, and leaves the rest of the text", () => {
  const text = 'import { compose } from "kit/compose";\nimport { maze } from "maze";\nexport default ($) => compose("x");\n';
  const r = rewriteGlue(text, URLS, "workbench.js");
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.text, 'import { compose } from "blob:compose";\nimport { maze } from "blob:maze";\nexport default ($) => compose("x");\n');
});

test("rewriteGlue refuses what scanGlue refuses (an import of anything else: K007; a tested handle: S301), with no text", () => {
  const other = rewriteGlue('import { x } from "./helpers.js";\nexport default () => 0;\n', URLS, "workbench.js");
  assert.equal(other.text, null);
  assert.deepEqual(other.diagnostics.map((d) => d.code), ["K007"]);
  const tested = rewriteGlue('import { maze } from "maze";\nexport default () => { const a = maze("a"); if (a.out.x) {} };\n', URLS);
  assert.equal(tested.text, null);
  assert.deepEqual(tested.diagnostics.map((d) => d.code), ["S301"]);
});

test("callGlue: a default export ($) => composition gives the composition", () => {
  const r = callGlue(($) => { const b = g("box").size(2); return compose("c").part(b).show(b); }, "workbench.js");
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.composition.build({ runtimes: [W.runtime] }).parts[0].name, "box");
  // `$` read inside a part's lambda is the part's own, not the glue's
  const lam = callGlue(($) => { const b = g("box").param("n", { value: 3, min: 1, max: 9 }).size(2).k("() => $.n"); return compose("c").part(b).show(b); });
  assert.deepEqual(lam.diagnostics, []);
});

test("callGlue: a build-time read of the glue's $ is S104 (there is no glue-level $), even when the glue catches it", () => {
  const read = callGlue(($) => { const b = g("box").param("n", { value: 3, min: 1, max: 9 }).size(2).label(`n is ${$.n}`); return compose("c").part(b).show(b); }, "workbench.js");
  assert.equal(read.composition, null);
  assert.deepEqual(read.diagnostics.map((d) => d.code), ["S104"]);
  assert.match(read.diagnostics[0].message, /\$\.n/);
  assert.equal(read.diagnostics[0].file, "workbench.js");
  const caught = callGlue(($) => { let n = 1; try { n = $.n; } catch {} const b = g("box").size(n); return compose("c").part(b).show(b); });
  assert.deepEqual(caught.diagnostics.map((d) => d.code), ["S104"]);
  const spread = callGlue(($) => { const all = { ...$ }; return compose("c"); });
  assert.deepEqual(spread.diagnostics.map((d) => d.code), ["S104"]);
});

test("callGlue: no function, a throw, or something other than a composition is S103; a kit code thrown is kept", () => {
  for (const [label, exported] of [["missing", undefined], ["a number", 42], ["returns a number", () => 7], ["returns a Program", () => g("box").size(1)]]) {
    const r = callGlue(exported, "workbench.js");
    assert.equal(r.composition, null, label);
    assert.deepEqual(r.diagnostics.map((d) => d.code), ["S103"], label);
  }
  const threw = callGlue(() => { throw new Error("boom"); }, "workbench.js");
  assert.deepEqual(threw.diagnostics.map((d) => [d.code, d.severity]), [["S103", "error"]]);
  assert.match(threw.diagnostics[0].message, /boom/);
  const handle = callGlue(() => { const b = g("box").size(1); return b.out.nothing.y; });
  assert.equal(handle.diagnostics[0].code, "S301");
  assert.ok(Object.hasOwn(COMPOSE_CODES, "S103") && Object.hasOwn(COMPOSE_CODES, "S104"));
});
