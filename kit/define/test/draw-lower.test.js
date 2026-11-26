// A Draw builder is Bench code (the draw-list draft's ruling 1): each layer goes through kit/lower like any Runtime
// Lambda, against the Dialect's environment for one Program, with the record typed from its value, the inputs
// global holding its Draw inputs as lists of ops, and its result typed as ops from kit/draw's table. A builder
// outside the Runtime Subset is refused at defineDialect with the parser's own code; a type or name mistake is
// lowering's own L code when a Program lowers; a whole builder's concatenation has its static max.

import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, DefinitionError } from "../index.js";
import { DRAW_CODES } from "../../draw/index.js";
import { drawnMaze, drawnMazeDecl, screen, GRID, steer } from "../../draw/fixtures/draw-dialects.js";

/** @param {(d: any) => void} [change] */
const lowerMaze = (change) => { const g = /** @type {any} */ (drawnMaze(change)); return g.lower(g("level").grid(GRID).control(steer).build()); };
/** @param {(d: any) => void} [change] */
const lowerScreen = (change) => { const g = /** @type {any} */ (screen(change)); return g.lower(g("scr").size({ width: 40, height: 32 }).build()); };
/** @param {any} low */
const errors = (low) => low.diagnostics.filter((/** @type {any} */ d) => d.severity === "error");

test("each layer of a builder lowers to a Kernel, and the Program's max is as before", () => {
  const low = lowerMaze();
  assert.deepEqual(errors(low), []);
  const v = low.seams.draws.view;
  assert.equal(v.max, 4);
  assert.equal(v.layers.length, 2);
  assert.ok(v.layers.every((/** @type {any} */ l) => l.result.ok && l.result.kernel));
});

test("a builder outside the Runtime Subset is refused at defineDialect with the parser's code", () => {
  const d = drawnMazeDecl();
  d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "text", at: [c.x, c.y], str: `coin`, font: "mono", fill: "coin" });
  /** @type {any[]} */
  let got = [];
  try { defineDialect(/** @type {any} */ (d)); } catch (e) { assert.ok(e instanceof DefinitionError); got = /** @type {any} */ (e).diagnostics; }
  assert.equal(got.length, 1);
  assert.match(got[0].code, /^S/);
  assert.match(got[0].message, /out\.view|layers\[1\]/);
});

test("map is lowering's own L code now, not J002, and an op off the table is L003", () => {
  assert.equal(Object.hasOwn(DRAW_CODES, "J002"), false);
  const mapped = errors(lowerMaze((d) => { d.ports.out.view.layers[0].from = (/** @type {any} */ s) => s.coins.map((/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], r: [1, 1] })); }));
  assert.ok(mapped.length > 0 && mapped.every((/** @type {any} */ x) => /^L/.test(x.code)), mapped.map((/** @type {any} */ x) => x.code).join());
  assert.equal(mapped[0].port, "view");
  const noR = errors(lowerMaze((d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], fill: "coin" }); }));
  assert.deepEqual(noR.map((/** @type {any} */ x) => x.code), ["L003"]);
  assert.match(noR[0].message, /output 'view', layers\[1\]/);
});

test("a builder reads only what the kit can see: a closed-over name is L001", () => {
  const K = 2;
  const low = lowerMaze((d) => { d.ports.out.view.layers[1].from = (/** @type {any} */ c) => ({ op: "ellipse", at: [c.x, c.y], r: [K, K] }); });
  const codes = errors(low).map((/** @type {any} */ x) => x.code);
  assert.ok(codes.length >= 1 && codes.every((/** @type {string} */ c) => c === "L001"), codes.join());
});

test("a whole builder's concatenation has its static max: the parts' maxes summed", () => {
  const low = lowerScreen();
  assert.deepEqual(errors(low), []);
  // board is Draw<64>, plus one text op, under the seam's ceiling of 80
  assert.equal(low.seams.draws.view.max, 65);
  const over = errors(lowerScreen((d) => { d.ports.out.view.seam = "Draw<60>@px"; }));
  assert.deepEqual(over.map((/** @type {any} */ x) => x.code), ["L003"]);
  // the op union is named, not printed whole
  assert.match(over[0].message, /This is \[op; 65\], but a draw's result needs \(op \| \[op; 60\]\)\?/);
});

test("the inputs global holds a Draw input as a list of ops; a value input does not spread", () => {
  const bad = errors(lowerScreen((d) => {
    // @ts-ignore: inp is the inputs global
    d.ports.out.view.from = (/** @type {any} */ s) => [...inp.score];
  }));
  assert.deepEqual(bad.map((/** @type {any} */ x) => x.code), ["L003"]);
});

test("a pen layer's calls are typed against their op's fields", () => {
  const pen = (/** @type {any} */ f) => errors(lowerMaze((d) => { d.ports.out.view.layers[1] = { pen: f, max: 4 }; }));
  assert.deepEqual(pen((/** @type {any} */ s, /** @type {any} */ p) => { for (const c of s.coins) p.ellipse({ at: [c.x, c.y], r: [1, 1], fill: "coin" }); }), []);
  assert.deepEqual(pen((/** @type {any} */ _s, /** @type {any} */ p) => { p.ellipse({ at: [0, 0], r: "big" }); }).map((/** @type {any} */ x) => x.code), ["L003"]);
});
