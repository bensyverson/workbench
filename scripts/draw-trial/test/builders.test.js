// @ts-nocheck: the lambdas here are builders as data, run and scanned, with parameters a test needn't read or type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { list, struct } from "../../../kit/define/index.js";
import { builderOf, staticMax, scanBuilder, runBuilder } from "../checker/builders.js";

const state = { coins: list(struct({ x: "f64", y: "f64" }), 16), rows: list("str"), player: struct({ x: "f64", y: "f64" }) };

test("builderOf reads the three ways and layers, with each layer's max", () => {
  const whole = builderOf({ seam: "Draw<4>@cell", note: "n", from: (s) => [] }, state, 4);
  assert.deepEqual(whole.problems, []);
  assert.deepEqual(whole.layers.map((l) => [l.kind, l.max]), [["whole", null]]);
  const each = builderOf({ seam: "Draw<16>@cell", note: "n", each: "coins", from: (c, s) => null }, state, 16);
  assert.deepEqual(each.layers.map((l) => [l.kind, l.max, l.path]), [["each", 16, "coins"]]);
  const pen = builderOf({ seam: "Draw<9>@cell", note: "n", pen: (s, d) => {} }, state, 9);
  assert.deepEqual(pen.layers.map((l) => [l.kind, l.max]), [["pen", 9]]);
  const layered = builderOf({ seam: "Draw<30>@cell", note: "n", layers: [{ from: (s) => [] }, { each: "coins", from: (c, s) => null }, { pen: (s, d) => {}, max: 5 }] }, state, 30);
  assert.deepEqual(layered.problems, []);
  assert.deepEqual(layered.layers.map((l) => l.kind), ["whole", "each", "pen"]);
});

test("builderOf names each badly declared builder", () => {
  const cases = [
    [{ seam: "x", note: "n" }, /needs one builder/],
    [{ seam: "x", note: "n", from: () => [], pen: () => {} }, /one builder, not from and pen/],
    [{ seam: "x", note: "n", each: "coins" }, /each needs a from/],
    [{ seam: "x", note: "n", each: "nope", from: () => null }, /'nope' is not a list in your state/],
    [{ seam: "x", note: "n", each: "rows", from: () => null }, /has no max/],
    [{ seam: "x", note: "n", layers: [{ pen: () => {} }] }, /layers\[0\]: a pen layer states its max/],
    [{ seam: "x", note: "n", layers: [] }, /layers is empty/],
    [{ seam: "x", note: "n", layers: [{ from: () => [], seam: "y" }] }, /layers\[0\] has no key 'seam'/],
    [{ seam: "x", note: "n", from: () => [], default: [] }, /no key 'default'/],
    [{ seam: "x", note: "n", from: "coins" }, /from must be a lambda/],
  ];
  for (const [port, re] of cases) assert.match(builderOf(/** @type {any} */ (port), state, 8).problems.join("; "), /** @type {RegExp} */ (re));
});

test("staticMax adds an array literal's ops and the spread inputs' maxes, and is null when it cannot tell", () => {
  const b = (/** @type {any} */ fn) => builderOf({ seam: "x", note: "n", from: fn }, state, 99);
  assert.equal(staticMax(b((s, i) => [...i.board, ...i.fx, { op: "text" }]), { board: 10, fx: 20 }), 31);
  assert.equal(staticMax(b((s) => ({ op: "rect" })), {}), 1);
  assert.equal(staticMax(b((s) => helper(s)), {}), null);
  const layered = builderOf({ seam: "x", note: "n", layers: [{ from: (s) => [{ op: "a" }, { op: "b" }] }, { each: "coins", from: () => null }, { pen: () => {}, max: 5 }] }, state, 99);
  assert.equal(staticMax(layered, {}), 23);
});

const file = `const helper = (s) => s.coins.map((c) => c);\nexport const port = {\n  pen: (s, d) => { for (const c of s.coins) d.rect({ at: [c.x, c.y] }); },\n  bad: (s) => s.coins.map((c) => ({ op: "rect" })),\n  sees: (s) => [glyph(s), helper(s)],\n};\n`;

test("scanBuilder finds map and its kin, names a builder can't see, and subset breaks, at the file's line", () => {
  const ok = scanBuilder("(s, d) => { for (const c of s.coins) d.rect({ at: [c.x, c.y] }); }", { fileText: file, allowed: new Set() });
  assert.deepEqual(ok, []);
  const map = scanBuilder('(s) => s.coins.map((c) => ({ op: "rect" }))', { fileText: file, allowed: new Set() });
  assert.equal(map[0].code, "W003");
  assert.equal(map[0].line, 4);
  assert.match(map[0].message, /map/);
  const sees = scanBuilder("(s) => [glyph(s), helper(s)]", { fileText: file, allowed: new Set() });
  assert.match(sees.map((d) => d.message).join(";"), /glyph/);
  assert.match(sees.map((d) => d.message).join(";"), /helper.*map/, "a helper it calls is scanned too");
  const tpl = scanBuilder("(s) => `x${s}`", { fileText: "", allowed: new Set() });
  assert.equal(tpl[0].code, "S104");
});

test("runBuilder runs each way, keeps the order of layers, and drops a per-item null", () => {
  const s = { coins: [{ x: 1, y: 2 }, { x: 3, y: 4 }], player: { x: 0, y: 0 } };
  const b = builderOf({ seam: "x", note: "n", layers: [
    { from: (st) => ({ op: "rect", at: [0, 0], size: [1, 1] }) },
    { each: "coins", from: (c) => (c.x > 2 ? { op: "image", at: [c.x, c.y], image: "coin" } : null) },
    { pen: (st, d) => { d.text({ at: [0, 0], str: "hi", font: "mono", fill: "#000000" }); }, max: 1 },
  ] }, state, 9);
  const r = runBuilder(b, s, {});
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.ops.map((o) => o.op), ["rect", "image", "text"]);
  const inputs = { board: [{ op: "rect" }] };
  const root = builderOf({ seam: "x", note: "n", from: (st, i) => [...i.board, { op: "text" }] }, state, 9);
  assert.deepEqual(runBuilder(root, s, inputs).ops.map((o) => o.op), ["rect", "text"]);
});

test("runBuilder reports a throw, a pen layer past its max, a pen method that is not an op, and a whole list that is not a list", () => {
  const s = { coins: [], player: { x: 0, y: 0 } };
  const run = (/** @type {any} */ port) => runBuilder(builderOf(port, state, 9), s, {}).problems.join("; ");
  assert.match(run({ seam: "x", note: "n", from: (st) => st.nope.x }), /threw/);
  assert.match(run({ seam: "x", note: "n", layers: [{ pen: (st, d) => { d.rect({}); d.rect({}); }, max: 1 }] }), /more than its max 1/);
  assert.match(run({ seam: "x", note: "n", pen: (st, d) => { d.circle({}); } }), /threw.*circle/);
  assert.match(run({ seam: "x", note: "n", from: (st) => 3 }), /returned 3/);
});
