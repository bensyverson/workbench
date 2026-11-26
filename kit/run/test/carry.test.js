import { test } from "node:test";
import assert from "node:assert/strict";
import { carry } from "../carry.js";

test("a dropped field is matched by its name after the rename, never by the producer's name", () => {
  // rename { a: "x", x: "b" }: the producer's x arrives as b (taken); its a arrives as x, which the consumer drops
  const out = carry({ a: 1, x: 2 }, { rename: { a: "x", x: "b" }, dropped: ["x"], convert: [] });
  assert.deepEqual(out, { b: 2 });
});
