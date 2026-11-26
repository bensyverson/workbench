// The draw list seam, Draw<max>@<frame> (the draw-list draft, as ruled 2026-11-26): it parses only at a port's top,
// prints back, names its frame, and across a wire compares its max as a list does and plans one conversion of the
// whole list along the frame path (kind "draw").

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeam, printSeam, compareSeams, framesOf, frameOf } from "../index.js";

/** @param {string} s */
const ok = (s) => {
  const r = parseSeam(s);
  assert.ok(r.ok, `'${s}' should parse: ${"error" in r ? r.error : ""}`);
  return /** @type {any} */ (r).type;
};
/** @param {string} s */
const bad = (s) => {
  const r = parseSeam(s);
  assert.equal(r.ok, false, `'${s}' should not parse`);
  return /** @type {any} */ (r).error;
};

test("Draw<max>@frame parses, prints canonically and names its frame", () => {
  const t = ok("Draw< 256 >@cell");
  assert.deepEqual({ ...t }, { kind: "draw", max: 256, frame: "cell" });
  assert.equal(printSeam(t), "Draw<256>@cell");
  assert.deepEqual(framesOf(t), ["cell"]);
  assert.equal(frameOf(t), "cell");
  // the other kinds still parse
  assert.equal(printSeam(ok("list<f64, 3>")), "list<f64, 3>");
});

test("a malformed Draw seam is refused with a reason", () => {
  assert.match(bad("Draw<0>@cell"), /max is a positive whole number/);
  assert.match(bad("Draw<1.5>@cell"), /max is a positive whole number/);
  assert.match(bad("Draw<8>"), /measured in a frame/);
  assert.match(bad("Draw@cell"), /expected '<'/);
  assert.match(bad("list<Draw<8>@cell, 2>"), /whole port's type/);
  assert.match(bad("{ a: Draw<8>@cell }"), /whole port's type/);
  assert.match(bad("Draw<8>@cell/s"), /unexpected '\/'/);
});

test("a Draw wire compares maxes as a list does and plans one draw leaf", () => {
  const same = compareSeams(ok("Draw<40>@cell"), ok("Draw<64>@screen"));
  assert.deepEqual(same.problems, []);
  assert.deepEqual(same.tagged, [{ field: "", kind: "draw", dims: 2, from: "cell", to: "screen" }]);
  const over = compareSeams(ok("Draw<65>@cell"), ok("Draw<64>@screen"));
  assert.deepEqual(over.problems.map((p) => p.code), ["S204"]);
  assert.match(over.problems[0].message, /up to 65 ops and the input takes at most 64/);
  // a draw list never feeds another kind, nor the reverse
  assert.deepEqual(compareSeams(ok("Draw<4>@cell"), ok("list<f64, 4>")).problems.map((p) => p.code), ["S201"]);
  assert.deepEqual(compareSeams(ok("point2@cell"), ok("Draw<4>@cell")).problems.map((p) => p.code), ["S201"]);
});
