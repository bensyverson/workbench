// The fields Library, as the Definition API declares it: intrinsics written in the Runtime Subset, so they
// lower like any helper and reach every target without a spelling of their own. A Program gets the ones it
// names (and the ones those name), by the Dialect's `libraryFor`. Their parameter types come from the call
// sites, as a Program's helpers' do. Declaration order is the order they are lowered in.

/** @import { LibraryDef } from "../../define/define.js" */

/** @type {Record<string, LibraryDef>} */
export const library = {
  // A positive modulo: x - n * floor(x / n), which is ((x % n) + n) % n for whole n.
  pmod: { fn: "(x, n) => x - n * floor(x / n)" },
  // Value noise in [0, 1], a cubic fade between four hashed lattice corners.
  vnoise: {
    fn: `(p, s) => {
  const i = floor(p);
  const f = p - i;
  const u = f * f * (vec2(3, 3) - 2 * f);
  const a = ihash(i.x, i.y, s);
  const b = ihash(i.x + 1, i.y, s);
  const c = ihash(i.x, i.y + 1, s);
  const d = ihash(i.x + 1, i.y + 1, s);
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}`,
  },
  // Five octaves of vnoise: gain 0.5, lacunarity 2.02, each octave rotated 0.5 rad and shifted by 100.
  OCTAVE_COS: { const: "cos(0.5)" },
  OCTAVE_SIN: { const: "sin(0.5)" },
  fbm: {
    fn: `(p, s) => {
  let v = 0;
  let a = 0.5;
  let q = p;
  for (let i = 0; i < 5; i++) {
    v += a * vnoise(q, s);
    q = vec2(2.02 * (OCTAVE_COS * q.x - OCTAVE_SIN * q.y) + 100, 2.02 * (OCTAVE_SIN * q.x + OCTAVE_COS * q.y) + 100);
    a *= 0.5;
  }
  return v;
}`,
  },
};
