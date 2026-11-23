// Seeded button traces for presets that read input. The generator has its own
// PRNG so it never touches the game's RNG stream.

const DIRECTIONS = ["up", "down", "left", "right"];

/** @param {number} seed */
function xorshift(seed) {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/**
 * Returns `frames` button sets: runs of held buttons lasting 1–30 frames, mixing
 * directions with A (often), B (sometimes) and start (rarely, which also restarts a game that is over).
 * @param {number} seed
 * @param {number} frames
 * @returns {string[][]}
 */
export function inputTrace(seed, frames) {
  const rnd = xorshift(seed * 2246822519);
  /** @type {string[][]} */
  const out = [];
  while (out.length < frames) {
    /** @type {string[]} */
    const held = [];
    if (rnd() < 0.6) held.push(DIRECTIONS[Math.floor(rnd() * 4)]);
    if (rnd() < 0.5) held.push("A");
    if (rnd() < 0.15) held.push("B");
    if (rnd() < 0.03) held.push("start");
    const run = 1 + Math.floor(rnd() * 30);
    for (let i = 0; i < run && out.length < frames; i++) out.push(held.slice());
  }
  return out;
}
