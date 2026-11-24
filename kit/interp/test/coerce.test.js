// The store rules (ir.d.ts, `Coerce`): what a place does to a value written to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce } from "../index.js";

test("u8: truncate toward zero, then wrap into 0..255", () => {
  assert.equal(coerce({ type: "u8" }, 7.9), 7);
  assert.equal(coerce({ type: "u8" }, -7.9), 249, "-7.9 truncates to -7, which wraps to 249");
  assert.equal(coerce({ type: "u8" }, 256), 0);
  assert.equal(coerce({ type: "u8" }, 260.7), 4);
  assert.equal(coerce({ type: "u8" }, -1), 255);
  assert.equal(coerce({ type: "u8" }, -256), 0);
});

test("i8, u16, i16 wrap into their own ranges", () => {
  assert.equal(coerce({ type: "i8" }, 128), -128);
  assert.equal(coerce({ type: "i8" }, -129), 127);
  assert.equal(coerce({ type: "i8" }, 127), 127);
  assert.equal(coerce({ type: "u16" }, 65536), 0);
  assert.equal(coerce({ type: "u16" }, -1), 65535);
  assert.equal(coerce({ type: "i16" }, 32768), -32768);
  assert.equal(coerce({ type: "i16" }, -32769), 32767);
});

test("min and max clamp after the truncation and before the wrap", () => {
  assert.equal(coerce({ type: "u8", max: 9 }, 12.5), 9, "12.5 truncates to 12, then clamps to 9");
  assert.equal(coerce({ type: "u8", max: 9 }, 300), 9, "a clamp comes before the wrap, so 300 does not wrap to 44");
  assert.equal(coerce({ type: "i8", min: -5 }, -100), -5);
  assert.equal(coerce({ type: "u8", min: 3, max: 9 }, 5), 5);
});

test("fix rounds to 1/256, clamps, then wraps into [-128, 128)", () => {
  assert.equal(coerce({ type: "fix" }, 1.5), 1.5);
  assert.equal(coerce({ type: "fix" }, 1 / 3), 85 / 256);
  assert.equal(coerce({ type: "fix" }, 128), -128);
  assert.equal(coerce({ type: "fix" }, 130.5), -125.5);
  assert.equal(coerce({ type: "fix" }, -128.5), 127.5);
  assert.equal(coerce({ type: "fix", max: 10 }, 50), 10);
  assert.equal(coerce({ type: "fix", min: -2 }, -50), -2);
});

test("f64 and f32 places keep the value and only refuse one that is not finite", () => {
  assert.equal(coerce({ type: "f64" }, 0.1), 0.1);
  assert.equal(coerce({ type: "f32" }, 0.1), Math.fround(0.1), "an f32 place holds an f32");
  for (const t of /** @type {const} */ (["f64", "f32"])) {
    assert.throws(() => coerce({ type: t }, NaN), TypeError);
    assert.throws(() => coerce({ type: t }, Infinity), TypeError);
  }
});

test("a sized integer refuses a value that is not finite", () => {
  for (const t of /** @type {const} */ (["u8", "i8", "u16", "i16", "fix"])) assert.throws(() => coerce({ type: t }, NaN), TypeError, t);
  assert.throws(() => coerce({ type: "u8" }, Infinity), TypeError);
});

test("bool stores truthiness; enum accepts only its values", () => {
  assert.equal(coerce({ type: "bool" }, 1), true);
  assert.equal(coerce({ type: "bool" }, 0), false);
  assert.equal(coerce({ type: "bool" }, "x"), true);
  assert.equal(coerce({ type: "enum", values: ["a", "b"] }, "b"), "b");
  assert.throws(() => coerce({ type: "enum", values: ["a", "b"] }, "c"), TypeError);
});
