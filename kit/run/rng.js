// A seeded random stream per part (sfc32), owned by the kit so a replay is exact. Its whole state is four 32-bit
// words, kept with the part's snapshot and in checkpoints.

/** @typedef {[number, number, number, number]} RngState */

/**
 * The first state of a part's stream: from the run's seed and the part's name, so two parts never share a stream.
 * @param {number} seed @param {string} part @returns {RngState}
 */
export function seedRng(seed, part) {
  let h = 2166136261 ^ (seed >>> 0);
  /** @type {number[]} */
  const words = [];
  for (const s of [`a${part}`, `b${part}`, `c${part}`, `d${part}`]) {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    words.push(h >>> 0);
  }
  /** @type {RngState} */
  const st = [words[0], words[1], words[2], words[3]];
  for (let i = 0; i < 12; i++) next(st);
  return st;
}

/**
 * The next number in [0, 1), advancing `st` in place.
 * @param {RngState} st @returns {number}
 */
export function next(st) {
  let [a, b, c, d] = st;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  st[0] = a >>> 0; st[1] = b; st[2] = c; st[3] = d;
  return t / 4294967296;
}
