// @ts-nocheck: the builders below read `inp` and `helper` as free names (the inputs global, and a name the kit
// cannot see into), which only their source text is read for here.

// A Draw output's builder: declared in one of four ways (from, each with from, pen, layers), held to the Runtime
// Subset, scanned for the op kinds it can hold (the op tags it writes are literals), given its max from the built
// record under the seam's ceiling (ruling 1), and its list built on one state by the functions it is handed (the
// emitted Kernels, in a run: kit/run): typed op by op, held to its maxes, its colors resolved and its images named
// by its part.

import { test } from "node:test";
import assert from "node:assert/strict";
import { declareDraw, drawMax, runDraw, carryList, DRAW_CODES } from "../index.js";

const listMax = (/** @type {string} */ path) => (path === "things" ? 50 : path === "open" ? "open" : null);
const ctx = { listMax, inputsName: "inp" };
const paint = { colors: { wall: "#4a6fa5" }, images: { sheet: { size: [16, 8], cell: [8, 8] } } };

/** @param {any} port */
const declared = (port) => {
  const r = declareDraw(port, ctx);
  assert.deepEqual(r.problems, [], r.problems.join("\n"));
  return /** @type {any} */ (r.decl);
};
/** @param {any} port @param {RegExp} re */
const refused = (port, re) => {
  const r = declareDraw(port, ctx);
  assert.equal(r.decl, null);
  assert.ok(r.problems.some((p) => re.test(p.message)), r.problems.map((p) => `${p.code} ${p.message}`).join("\n"));
  return r.problems;
};

test("each of the four declarations gives its layers", () => {
  assert.deepEqual(declared({ seam: "", from: (s) => [] }).layers.map((/** @type {any} */ l) => l.kind), ["whole"]);
  assert.deepEqual(declared({ each: "things", from: (t, s) => null }).layers.map((/** @type {any} */ l) => [l.kind, l.path, l.max]), [["each", "things", 50]]);
  assert.deepEqual(declared({ pen: (s, pen) => {} }).layers.map((/** @type {any} */ l) => l.kind), ["pen"]);
  const d = declared({ layers: [{ from: (s) => null }, { each: "things", from: (t) => null }, { pen: (s, p) => {}, max: (r) => r.n }] });
  assert.deepEqual(d.layers.map((/** @type {any} */ l) => l.kind), ["whole", "each", "pen"]);
});

test("a malformed declaration is J001, and a builder outside the Runtime Subset has the subset's own code", () => {
  for (const p of refused({ from: (s) => [], pen: (s, p) => {} }, /one builder, not from and pen/)) assert.equal(p.code, "J001");
  refused({ each: "things" }, /each needs a from/);
  refused({ each: "grid", from: (t) => null }, /each names 'grid', which is not a list in the state/);
  refused({ each: "open", from: (t) => null }, /no max/);
  refused({ note: "x" }, /needs one builder/);
  refused({ from: "view" }, /a function/);
  refused({ from: (s) => [], max: "8" }, /max is a whole number or a function of the built record/);
  refused({ layers: [{ pen: (s, p) => {} }] }, /a pen layer states its max/);
  refused({ layers: [] }, /layers is empty/);
  refused({ layers: [{ each: "things", from: (t) => null, size: 1 }] }, /no key 'size'/);
  const [p] = refused({ from: (s) => ({ op: "text", str: `hi` }) }, /the builder, line 1: /);
  assert.match(p.code, /^S/);
  // map is no longer judged here: it is lowering's own L code when a Program lowers (kit/define's draw-lower)
  assert.deepEqual(declareDraw({ from: (s) => s.things.map((t) => null) }, ctx).problems, []);
});

test("the kinds a builder can hold are read from its literal op tags, its pen calls and the inputs it spreads", () => {
  const k = (/** @type {any} */ port) => declared(port).kinds;
  assert.deepEqual(k({ from: (s) => [{ op: "rect" }, s.a ? { op: "text" } : null, ...inp.board, ...inp.fx] }), { ops: ["rect", "text"], inputs: ["board", "fx"], open: false });
  assert.deepEqual(k({ from: (s) => { if (s.a) return { op: "image" }; return null; } }), { ops: ["image"], inputs: [], open: false });
  assert.deepEqual(k({ each: "things", from: (t) => (t.wall ? { op: "tiles" } : { op: "image" }) }), { ops: ["tiles", "image"], inputs: [], open: false });
  assert.deepEqual(k({ pen: (s, pen) => { for (const p of s.ps) pen.ellipse({}); pen.text({}); } }), { ops: ["ellipse", "text"], inputs: [], open: false });
  // what the kit cannot see: a computed op tag, a helper's result, a pen handed on
  assert.equal(k({ from: (s) => [{ op: s.kind }] }).open, true);
  assert.equal(k({ from: (s) => helper(s) }).open, true);
  assert.equal(k({ pen: (s, pen) => { helper(pen); } }).open, true);
  assert.deepEqual(k({ layers: [{ from: (s) => ({ op: "rect" }) }, { pen: (s, p) => { p.text({}); }, max: 2 }] }), { ops: ["rect", "text"], inputs: [], open: false });
});

test("a Program's max comes from the port's max(record), else its layers', else the seam's ceiling", () => {
  assert.deepEqual(drawMax(declared({ from: (s) => [], max: (r) => r.n }), 100, { n: 40 }), { ok: true, max: 40 });
  assert.deepEqual(drawMax(declared({ from: (s) => [], max: 12 }), 100, {}), { ok: true, max: 12 });
  assert.deepEqual(drawMax(declared({ layers: [{ each: "things", from: (t) => null }, { pen: (s, p) => {}, max: (r) => r.n }] }), 100, { n: 3 }), { ok: true, max: 53 });
  assert.deepEqual(drawMax(declared({ pen: (s, p) => {} }), 100, {}), { ok: true, max: 100 });
  // a whole layer's static max, from its lowering, counts with the others
  assert.deepEqual(drawMax(declared({ layers: [{ from: (s) => null }, { each: "things", from: (t) => null }] }), 100, {}, [3, null]), { ok: true, max: 53 });
  assert.deepEqual(drawMax(declared({ from: (s) => null }), 100, {}, [7]), { ok: true, max: 7 });
  const over = drawMax(declared({ from: (s) => [], max: (r) => r.n }), 100, { n: 400 });
  assert.equal(over.ok, false);
  assert.match(/** @type {any} */ (over).error, /400 ops.*Draw<100>/);
  assert.match(/** @type {any} */ (drawMax(declared({ from: (s) => [], max: (r) => -1 }), 100, {})).error, /whole number of at least 0/);
});

test("a builder's layers run through the functions it is handed, and its ops leave typed and carried", () => {
  const board = carryList([{ op: "rect", at: [5, 5], size: [1, 1], fill: "#000000ff" }]);
  const n = 2;
  // the functions a run hands are the emitted Kernels, with the inputs and the params bound as their globals
  const fns = [
    (s, record) => [{ op: "rect", at: [0, 0], size: [record.w, 1], fill: "wall" }, ...board],
    (t, s) => (t.on ? { op: "image", at: [t.x, 0], image: "sheet", cell: 1 } : null),
    (s, pen) => { pen.text({ at: [0, 0], str: "HI " + n, font: "mono", fill: "#ffffff" }); },
  ];
  const d = declared({ layers: [{ from: fns[0] }, { each: "things", from: fns[1] }, { pen: fns[2], max: 1 }] });
  const r = runDraw(d, { state: { things: [{ on: true, x: 3 }, { on: false, x: 4 }] }, record: { w: 9 }, max: 10, paint, part: "lvl", fns });
  assert.ok(r.ok, /** @type {any} */ (r).message);
  assert.deepEqual(/** @type {any} */ (r).list, [
    { op: "rect", at: [0, 0], size: [9, 1], fill: "#4a6fa5ff" },
    { op: "rect", at: [5, 5], size: [1, 1], fill: "#000000ff" },
    { op: "image", at: [3, 0], image: "lvl.sheet", cell: 1 },
    { op: "text", at: [0, 0], str: "HI 2", font: "mono", fill: "#ffffffff" },
  ]);
});

test("a list over its max, a pen layer over its own, an op off the table and a throw are refused, never truncated", () => {
  const run = (/** @type {any} */ port, max = 2) => { const d = declared(port); return runDraw(d, { state: { things: [] }, record: {}, max, paint, part: "p", fns: (port.layers ?? [port]).map((/** @type {any} */ l) => l.from ?? l.pen) }); };
  /** @param {any} r @param {string} code @param {RegExp} re */
  const no = (r, code, re) => { assert.equal(r.ok, false); assert.equal(r.code, code); assert.match(r.message, re); };
  const op = { op: "rect", at: [0, 0], size: [1, 1] };
  no(run({ from: (s) => [op, op, op] }), "J021", /3 ops, and its max is 2/);
  no(run({ layers: [{ pen: (s, p) => { p.rect({ at: [0, 0], size: [1, 1] }); p.rect({ at: [0, 0], size: [1, 1] }); }, max: 1 }] }), "J021", /layers\[0\].*more than its max of 1/);
  no(run({ from: (s) => [{ op: "rect", at: [0, 0] }] }), "J020", /op 0: a rect needs size/);
  // throw is outside the subset, but a handed function can still throw (a host's bug, a Kernel reading a missing global)
  no(runDraw(declared({ from: (s) => null }), { state: {}, record: {}, max: 2, paint, part: "p", fns: [() => { throw new Error("boom"); }] }), "J022", /threw: boom/);
  no(run({ from: (s) => 7 }), "J020", /an op, a list of ops or null/);
  assert.equal(Object.keys(DRAW_CODES).length > 0, true);
});

test("a layer's max is judged for each Program: one that is not a whole number is J010, never a silent ceiling or an empty pen (review F6)", () => {
  const pen = (s, p) => { p.rect({ at: [0, 0], size: [1, 1] }); };
  const bad = (/** @type {any} */ port) => { const m = drawMax(declared(port), 8, {}); assert.equal(m.ok, false); return /** @type {any} */ (m).error; };
  assert.match(bad({ layers: [{ pen, max: () => undefined }] }), /layers\[0\]: its max\(record\) gives undefined; a max is a whole number of at least 0/);
  // a port max does not excuse a layer's
  assert.match(bad({ max: 8, layers: [{ pen, max: () => undefined }] }), /layers\[0\]/);
  assert.match(bad({ layers: [{ pen, max: () => -3 }, { pen, max: 5 }] }), /layers\[0\]: its max\(record\) gives -3/);
  assert.match(bad({ layers: [{ from: (s) => null, max: () => 1.5 }] }), /layers\[0\]: its max\(record\) gives 1.5/);
  // and runDraw, handed such a layer, stops rather than drawing nothing
  const r = runDraw(declared({ layers: [{ pen, max: () => undefined }] }), { state: {}, record: {}, max: 8, paint, part: "p", fns: [pen] });
  assert.equal(r.ok, false);
  assert.equal(/** @type {any} */ (r).code, "J010");
  // what must still work: a whole-number layer max, by number or record
  assert.deepEqual(drawMax(declared({ layers: [{ pen, max: (r) => r.n }, { pen, max: 2 }] }), 8, { n: 3 }), { ok: true, max: 5 });
});

test("a from layer that states its max is held to it at run time (review F12)", () => {
  const three = (s) => [{ op: "rect", at: [0, 0], size: [1, 1] }, { op: "rect", at: [1, 0], size: [1, 1] }, { op: "rect", at: [2, 0], size: [1, 1] }];
  const d = declared({ layers: [{ from: three, max: 1 }, { pen: (s, p) => {}, max: 4 }] });
  const r = runDraw(d, { state: {}, record: {}, max: 5, paint, part: "p", fns: [three, () => {}] });
  assert.equal(r.ok, false);
  assert.equal(/** @type {any} */ (r).code, "J021");
  assert.match(/** @type {any} */ (r).message, /layers\[0\] gave 3 ops, more than its max of 1/);
});
