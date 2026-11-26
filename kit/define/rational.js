// Exact rational time: a workbench's instants are multiples of each tick part's period, so 1/8 and 1/30 meet at
// exactly 1/2 with no drift. A rational is { n, d }: whole numbers, d > 0, in lowest terms. Numbers stay well
// inside 2^53 for any run a page or a test makes (an hour at 1/120 s is 432 000 ticks).

/** @typedef {{ n: number, d: number }} Q */

/** @param {number} a @param {number} b @returns {number} */
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };

/** A rational in lowest terms. @param {number} n @param {number} [d] @returns {Q} */
export function q(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`q(${n}, ${d}): a rational is two whole numbers, the second not 0`);
  const g = gcd(n, d), s = d < 0 ? -1 : 1;
  return { n: (s * n) / g + 0, d: (s * d) / g };
}

/** @param {Q} a @param {Q} b */
export const add = (a, b) => q(a.n * b.d + b.n * a.d, a.d * b.d);
/** @param {Q} a @param {Q} b */
export const sub = (a, b) => q(a.n * b.d - b.n * a.d, a.d * b.d);
/** @param {Q} a @param {Q} b */
export const mul = (a, b) => q(a.n * b.n, a.d * b.d);
/** @param {Q} a @param {Q} b */
export const div = (a, b) => q(a.n * b.d, a.d * b.n);
/** -1, 0 or 1. @param {Q} a @param {Q} b */
export const cmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
/** The larger. @param {Q} a @param {Q} b */
export const max = (a, b) => (cmp(a, b) >= 0 ? a : b);
/** floor(a / b), a whole number. @param {Q} a @param {Q} b */
export const floorDiv = (a, b) => { const r = div(a, b); return Math.floor(r.n / r.d); };
/** ceil(a / b), a whole number. @param {Q} a @param {Q} b */
export const ceilDiv = (a, b) => { const r = div(a, b); return Math.ceil(r.n / r.d); };
/** @param {Q} a */
export const toNumber = (a) => a.n / a.d;
/** "19/8", or "2" for a whole number. @param {Q} a */
export const qText = (a) => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);
/** The rational a qText wrote. @param {string} s @returns {Q} */
export const parseQ = (s) => { const [n, d] = s.split("/").map(Number); return q(n, d ?? 1); };

const MAX_DENOMINATOR = 1_000_000;

/**
 * The rational a number means, by continued fractions: the simplest one within 1e-12 (relative) whose denominator
 * is at most a million, so 1/30 written as a float is exactly 1/30; null when there is none (π·1e-7).
 * @param {number} x @returns {Q | null}
 */
export function fromNumber(x) {
  if (!Number.isFinite(x)) return null;
  const tol = 1e-12 * Math.max(1, Math.abs(x));
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let y = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(y);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > MAX_DENOMINATOR) return null;
    if (Math.abs(h1 / k1 - x) <= tol) return q(h1, k1);
    const f = y - a;
    if (f === 0) return null;
    y = 1 / f;
  }
  return null;
}
