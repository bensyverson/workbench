// The fields Library: intrinsics written in the Runtime Subset, so they lower like any
// helper and reach every target without a spelling of their own. A Program gets the ones it
// names (and the ones those name), by `libraryFor`. Their parameter types come from the call
// sites, as a Program's helpers' do.

/** @import { UnitDecl } from "./decls.js" */

/** @type {UnitDecl[]} */
export const LIBRARY = [
  // A positive modulo: x - n * floor(x / n), which is ((x % n) + n) % n for whole n.
  { name: "pmod", kind: "fn", src: "(x, n) => x - n * floor(x / n)" },
  // Value noise in [0, 1], a cubic fade between four hashed lattice corners.
  {
    name: "vnoise", kind: "fn", src: `(p, s) => {
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
  { name: "OCTAVE_COS", kind: "const", src: "cos(0.5)" },
  { name: "OCTAVE_SIN", kind: "const", src: "sin(0.5)" },
  {
    name: "fbm", kind: "fn", src: `(p, s) => {
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
];

/**
 * The library units a source uses, in dependency order: those it names, then those they name.
 * @param {string[]} sources  The sources that may use the library.
 * @returns {UnitDecl[]}
 */
export function libraryFor(sources) {
  const uses = (/** @type {string} */ src, /** @type {string} */ name) => new RegExp(`(?<![\\w.$])${name}(?![\\w$])`).test(src);
  const wanted = new Set();
  const grow = (/** @type {string} */ src) => {
    for (const u of LIBRARY) if (!wanted.has(u.name) && uses(src, u.name)) { wanted.add(u.name); grow(u.src); }
  };
  for (const s of sources) grow(s);
  return LIBRARY.filter((u) => wanted.has(u.name));
}
