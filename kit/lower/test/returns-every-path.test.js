// A value a slot must return is returned on every path (decision MpZZsU, item 4), in the DMG Dialect too: a `done`
// that can fall off its end is refused, while a slot whose type may be null (`draw`) and a method's inferred
// optional type are not. Written after the check, when kit/emit/js's `done` fall-off case went red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lower, codes } from "./fixture.js";

test("DMG: a done that can reach its end without a return is one L003", () => {
  assert.deepEqual(codes(lower("(w) => { if (w.score > 0) return true; }", "done", "World")), ["L003"]);
  assert.deepEqual(codes(lower("(w) => { if (w.score > 0) return true; return false; }", "done", "World")), []);
  assert.deepEqual(codes(lower("(w) => { if (w.score > 0) { return true; } else { return false; } }", "done", "World")), []);
});

test("DMG: a draw may return nothing, and so may a method", () => {
  assert.deepEqual(codes(lower("(self, w) => { if (self.up) return \"up\"; }", "draw")), []);
  assert.deepEqual(codes(lower("(self) => { if (self.up) return false; }", "method")), []);
});
