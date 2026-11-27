// A number as a person set it (leaf ZNpW0f, the integrator's ruling): a drag's or a knob's value goes through float
// arithmetic, so 29.4 comes out as 29.400000000000006. A value the page previews and writes back is rounded here,
// once, so the preview's record and the written text hold the same number: to the step's own decimals when there is
// a step, else, to the 15 significant digits every double holds faithfully when that moves it only by float noise (a few
// ulps; a whole number is never moved). Pure.

/** The significant decimal digits a double holds faithfully (C's DBL_DIG): any decimal of this many survives a round trip through a double. */
export const NUMBER_DIGITS = 15;

/**
 * A number rounded to a step (a multiple of it, counted from `min` when there is one, written with the step's
 * decimals) and kept inside `min` and `max`, or, with no step, to NUMBER_DIGITS significant digits when that only
 * removes float noise; -0 is 0, a non-finite number is unchanged, and a finite one never becomes non-finite.
 * @param {number} n @param {number} [step] @param {{ min?: number, max?: number }} [bounds]
 */
export function roundNumber(n, step, bounds = {}) {
  if (!Number.isFinite(n)) return n;
  if (step && Number.isFinite(step)) {
    // the step's decimals from its exponent form, which String() gives below 1e-6 ("1e-7" has seven)
    const decimals = (/** @type {number} */ x) => {
      const [mantissa, exponent] = x.toExponential().split("e");
      return Math.max(0, (mantissa.split(".")[1] ?? "").length - Number(exponent));
    };
    const { min, max } = bounds;
    const from = typeof min === "number" ? min : 0;
    const digits = Math.min(100, Math.max(decimals(step), typeof min === "number" ? decimals(min) : 0));
    let x = Number((from + Math.round((n - from) / step) * step).toFixed(digits));
    // a range whose max is no multiple of the step keeps its max: the snap is clamped back inside
    if (typeof max === "number" && x > max) x = max;
    if (typeof min === "number" && x < min) x = min;
    return Number.isFinite(x) ? x + 0 : n;
  }
  // only float noise goes: a whole number, or a value the 15-digit form would move by more than a few ulps (a typed
  // 1234567890123456, 2**53, MAX_VALUE whose 15-digit form overflows), is kept as it is
  if (Number.isInteger(n)) return n + 0;
  const cut = Number(n.toPrecision(NUMBER_DIGITS));
  return Number.isFinite(cut) && Math.abs(cut - n) <= 8 * Number.EPSILON * Math.abs(n) ? cut + 0 : n;
}
