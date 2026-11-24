// domain-warp, run in the interpreter, against the book's own `frag` (the double-precision
// original, evaluated from the book's page). The book is gitignored and lives in the main
// checkout: without it the test says so and skips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { loadBook, DEFAULT_BOOK } from "../../../scripts/um-survey/book.js";
import { pixelOf } from "./fields-env.js";

/**
 * The tolerance of an f32 pixel against the book's doubles: each color component, absolute. The
 * test prints the maximum it observes (5.1e-4 over this grid of 270 pixels); this is four times that,
 * about half a step of an 8-bit channel.
 */
const TOLERANCE = 2e-3;

const W = 440, H = 300;
const CASES = [
  { palette: "fog", levels: 2, t: 0 },
  { palette: "fog", levels: 2, t: 1.3 },
  { palette: "grey", levels: 1, t: 0.4 },
  { palette: "marble", levels: 2, t: 2.1 },
  { palette: "marble", levels: 0, t: 0 },
];
const PIXELS = Array.from({ length: 9 * 6 }, (_, i) => [37 + (i % 9) * 45.5, 21 + Math.floor(i / 9) * 52.25]);

test("domain-warp's pixel Kernel matches the book's frag within the f32 tolerance", { skip: existsSync(DEFAULT_BOOK) ? false : `the book is not at ${DEFAULT_BOOK}` }, (t) => {
  const sketch = loadBook(DEFAULT_BOOK).sketches["04-noise/domain-warp"];
  /** @type {{ exports: Record<string, any> }} */
  const mod = { exports: {} };
  new Function("exports", "module", sketch.src)(mod.exports, mod);
  const frag = /** @type {(px: number, py: number, env: object) => number[]} */ (mod.exports.frag);
  const { pixel } = pixelOf(domainWarp);
  let max = 0, at = "";
  for (const c of CASES) {
    const params = { k: 4, levels: c.levels, scale: 3, palette: c.palette, seed: 1 };
    for (const [px, py] of PIXELS) {
      const want = frag(px, py, { w: W, h: H, t: c.t, params });
      const got = pixel([px / W, (H - py) / H], { ...params, t: c.t, aspect: W / H });
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(got[i] - want[i]);
        if (d > max) { max = d; at = `${c.palette} levels ${c.levels} t ${c.t} at ${px},${py} channel ${i}`; }
      }
    }
  }
  t.diagnostic(`max difference ${max.toExponential(3)} over ${CASES.length * PIXELS.length} pixels (${at}); tolerance ${TOLERANCE}`);
  assert.ok(max <= TOLERANCE, `max difference ${max} at ${at}`);
});
