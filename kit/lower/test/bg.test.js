// w.bg, the background map, as the DMG Dialect describes it: the members runtime lambdas use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";
import { emitKernel, instantiate } from "../../emit/js/index.js";

/** @import { Kernel } from "../../ir/ir.js" */

/**
 * Lowers on the world's tick and asserts success.
 * @param {string} src
 * @returns {Kernel}
 */
function ok(src) {
  const r = lower(src, "onFrame", "World");
  assert.deepEqual(r.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.code} ${d.message}`), []);
  assert.ok(r.kernel);
  return r.kernel;
}

test("get and at read a tile name, and a tile name compares with a literal", () => {
  const k = ok("(self, w) => { const t = w.bg.get(2, 3); if (t === \"floor\") w.score += 1; if (w.bg.at(w.next, 8) !== \"sky\") w.score += 1; }");
  assert.deepEqual(k.locals.find((l) => l.name === "t")?.t, "str");
  assert.ok(k.effects.includes("read bg"));
  assert.ok(k.effects.includes("read bg.scroll"), "at depends on the scroll");
  assert.ok(!k.effects.some((e) => e.startsWith("write bg")));
});

test("cell gives a screen position's map cell", () => {
  const k = ok("(self, w) => { const c = w.bg.cell(w.next, 9); w.score = c.cx + c.cy; }");
  assert.deepEqual(k.locals.find((l) => l.name === "c")?.t, { struct: { cx: "f64", cy: "f64" } });
  assert.ok(k.effects.includes("read bg.scroll"));
});

test("set writes the map, and chains", () => {
  const k = ok("(self, w) => { w.bg.set(1, 2, \"head\").set(3, 4, \"food\"); }");
  assert.ok(k.effects.includes("write bg"));
  assert.ok(!k.effects.includes("read bg"));
});

test("a tile name may be computed", () => {
  ok("(self, w) => { const t = w.bg.get(1, 1) === \"on\" ? \"off\" : \"on\"; w.bg.set(1, 1, t); }");
});

test("scroll takes one or two numbers and writes the scroll", () => {
  const k = ok("(self, w) => { w.bg.scroll(w.score); w.bg.scroll(w.score, 0); }");
  assert.ok(k.effects.includes("write bg.scroll"));
  assert.ok(!k.effects.includes("write bg"));
});

test("arguments are checked", () => {
  assert.deepEqual(codes(lower("(self, w) => { w.bg.get(\"a\", 1); }", "onFrame", "World")), ["L003"]);
  assert.deepEqual(codes(lower("(self, w) => { w.bg.set(1, 2, 3); }", "onFrame", "World")), ["L003"]);
  assert.deepEqual(codes(lower("(self, w) => { w.bg.set(1, 2); }", "onFrame", "World")), ["L015"]);
  assert.deepEqual(codes(lower("(self, w) => { w.bg.scroll(); }", "onFrame", "World")), ["L015"]);
});

test("the map is read-only as a whole, and members the presets do not use are unknown", () => {
  assert.deepEqual(codes(lower("(self, w) => { w.bg = w.bg; }", "onFrame", "World")), ["L013"]);
  assert.deepEqual(codes(lower("(self, w) => { w.bg.fill(\"grass\"); }", "onFrame", "World")), ["L002"]);
});

test("a write to the map is not allowed in draw or hud, a read is", () => {
  assert.deepEqual(codes(lower("(self, w) => { w.bg.set(1, 2, \"x\"); return null; }", "draw", "Mole")), ["L004"]);
  assert.deepEqual(codes(lower("(self, w) => { w.bg.scroll(3); return null; }", "draw", "Mole")), ["L004"]);
  assert.deepEqual(codes(lower("(self, w) => { return w.bg.get(1, 2) === \"x\" ? \"up\" : null; }", "draw", "Mole")), []);
  assert.deepEqual(codes(lower("(w, at) => { w.bg.set(1, 2, \"x\"); }", "hud", "World")), ["L004"]);
});

test("the emitted calls run against a map", () => {
  const k = ok("(self, w) => { if (w.bg.get(1, 1) === \"floor\") w.bg.set(1, 1, \"food\"); w.bg.scroll(w.score, 0); w.next = w.bg.cell(10, 20).cx; }");
  const fn = instantiate(emitKernel(k));
  /** @type {string[]} */
  const log = [];
  const bg = {
    get: (/** @type {number} */ x, /** @type {number} */ y) => { log.push(`get ${x},${y}`); return "floor"; },
    set: (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ n) => { log.push(`set ${x},${y},${n}`); return bg; },
    scroll: (/** @type {number} */ x, /** @type {number} */ y) => { log.push(`scroll ${x},${y}`); return bg; },
    cell: (/** @type {number} */ x, /** @type {number} */ y) => ({ cx: x >> 3, cy: y >> 3 }),
  };
  const w = { bg, score: 5, next: 0 };
  fn(w, w);
  assert.deepEqual(log, ["get 1,1", "set 1,1,food", "scroll 5,0"]);
  assert.equal(w.next, 1);
});
