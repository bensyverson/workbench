// A number as a person set it (leaf ZNpW0f, the integrator's ruling): a drag's or a knob's value goes through float
// arithmetic, so 29.4 comes out as 29.400000000000006. A value the page previews and writes back is rounded here,
// once, so the preview's record and the written text hold the same number: to the step's own decimals when there is
// a step, else to the 15 significant digits every double holds faithfully. Pure.

/** The significant decimal digits a double holds faithfully (C's DBL_DIG): any decimal of this many survives a round trip through a double. */
export const NUMBER_DIGITS = 15;

/**
 * A number rounded to a step (a multiple of it, written with the step's decimals) or, with none, to NUMBER_DIGITS
 * significant digits; -0 is 0, and a non-finite number is unchanged.
 * @param {number} n @param {number} [step]
 */
export function roundNumber(n, step) {
  if (!Number.isFinite(n)) return n;
  if (step) {
    // the step's decimals from its exponent form, which String() gives below 1e-6 ("1e-7" has seven)
    const [mantissa, exponent] = step.toExponential().split("e");
    const decimals = Math.min(100, Math.max(0, (mantissa.split(".")[1] ?? "").length - Number(exponent)));
    return Number((Math.round(n / step) * step).toFixed(decimals)) + 0;
  }
  return Number(n.toPrecision(NUMBER_DIGITS)) + 0;
}
