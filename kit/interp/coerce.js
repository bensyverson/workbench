// A store rule (ir.d.ts, `Coerce`): what a place does to the value written to it.

/** @import { Coerce } from "../ir/ir.js" */
/** @import { Value } from "./interp.js" */

/** The range each sized integer wraps into. */
const RANGE = { u8: [0, 255], i8: [-128, 127], u16: [0, 65535], i16: [-32768, 32767] };

/**
 * What `rule` stores for `v`. A sized integer truncates toward zero, then clamps to `min` and
 * `max` when given, then wraps into its range. `fix` rounds to 1/256, clamps, then wraps into
 * [-128, 128). `f64` and `f32` keep the number (an f32 rounded) and only refuse one that is not
 * finite, as every numeric rule does; `value` stores `v` unchanged; `bool` stores truthiness; an `enum` accepts only its values.
 * Refusing is a TypeError.
 * @param {Coerce} rule
 * @param {Value} v
 * @returns {Value}
 */
export function coerce(rule, v) {
  switch (rule.type) {
    case "value": return v;
    case "bool": return !!v;
    case "enum":
      if (!(rule.values ?? []).includes(/** @type {string} */ (v))) throw new TypeError(`${JSON.stringify(v)} is not one of ${(rule.values ?? []).join(", ")}`);
      return v;
    case "f64": case "f32": {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TypeError(`${v} is not a finite number`);
      return rule.type === "f32" ? Math.fround(n) : n;
    }
    case "fix": {
      const n = Math.round(Number(v) * 256) / 256;
      if (!Number.isFinite(n)) throw new TypeError(`${v} is not a finite number`);
      return clampThenWrap(n, rule, -128, 256);
    }
    default: {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new TypeError(`${v} is not a finite number`);
      const [lo, hi] = RANGE[rule.type];
      return clampThenWrap(Math.trunc(n), rule, lo, hi - lo + 1);
    }
  }
}

/**
 * The rule's `min` and `max` where `n` is past one (and the value stays there); otherwise `n`
 * wrapped into `[lo, lo + span)`, modulo the span as a CPU's integer is.
 * @param {number} n
 * @param {Coerce} rule
 * @param {number} lo
 * @param {number} span
 */
function clampThenWrap(n, rule, lo, span) {
  if (rule.max !== undefined && n > rule.max) return rule.max;
  if (rule.min !== undefined && n < rule.min) return rule.min;
  return ((n - lo) % span + span) % span + lo;
}
