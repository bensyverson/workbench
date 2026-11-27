// The one rule for a list length's type, shared by lowering and the verifier (leaf v4Ya0z): an f64 always, an f32
// while the list's max is at most 2^24.
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdsLength } from "../types.js";

test("an f64 holds any list's length; an f32 one of a max to 2^24", () => {
  assert.equal(holdsLength("f64", Number.MAX_SAFE_INTEGER), true);
  assert.equal(holdsLength("f32", 8), true);
  assert.equal(holdsLength("f32", 2 ** 24), true);
  assert.equal(holdsLength("f32", 2 ** 24 + 1), false);
  assert.equal(holdsLength("f32", Number.MAX_SAFE_INTEGER), false);
  assert.equal(holdsLength("bool", 1), false);
});
