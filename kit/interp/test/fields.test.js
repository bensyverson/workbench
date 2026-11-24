// The two H3 sketches, run in the interpreter. The uv-remaps are compared with the book's
// own `maps` and `grid` (rewritten here in doubles); domain-warp with the book's `frag`
// itself, in test/fields-book.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { swirl, bulge } from "../../dialects/fields/programs/uv-remaps.js";
import { pixelOf } from "./fields-env.js";

const clamp = (/** @type {number} */ x, /** @type {number} */ a, /** @type {number} */ b) => (x < a ? a : x > b ? b : x);
const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;

/** The book's grid, verbatim. */
function grid(/** @type {number} */ x, /** @type {number} */ y) {
  const gx = ((x % 10) + 10) % 10, gy = ((y % 10) + 10) % 10;
  const major = (((Math.floor(x / 10) % 5) + 5) % 5 === 0 && gx < 1.2) || (((Math.floor(y / 10) % 5) + 5) % 5 === 0 && gy < 1.2);
  if (major) return [0.886, 0, 0.102];
  if (gx < 1 || gy < 1) return [0.45, 0.45, 0.45];
  if (Math.hypot(x - 75, y - 75) < 20) return [0.84, 0.84, 0.84];
  return [1, 1, 1];
}

/** The book's swirl and bulge at pixel (px, py) of the 150-pixel panel, centered at c, in doubles. */
const BOOK = {
  swirl(/** @type {number} */ px, /** @type {number} */ py, /** @type {number[]} */ c, /** @type {number} */ angle) {
    const R = 63;
    let x = px - c[0], y = py - c[1]; const d = Math.hypot(x, y);
    if (d < R) { const pc = (R - d) / R, th = pc * pc * angle, s = Math.sin(th), co = Math.cos(th); [x, y] = [x * co - y * s, x * s + y * co]; }
    return grid(x + c[0], y + c[1]);
  },
  bulge(/** @type {number} */ px, /** @type {number} */ py, /** @type {number[]} */ c, /** @type {number} */ strength) {
    const R = 63;
    let x = px - c[0], y = py - c[1]; const d = Math.hypot(x, y);
    if (d < R && d > 0) { const pc = d / R, k = mix(1, smooth(0, R / d, pc), strength * 0.75); x *= k; y *= k; }
    return grid(x + c[0], y + c[1]);
  },
};

// Pixels chosen away from the grid's lines, where a color changes in an f32's width of position.
const POINTS = [[12.3, 41.7], [75.5, 75.5], [93.4, 58.8], [40.2, 110.6], [130.9, 22.3], [66.1, 83.9], [88.8, 91.1]];

for (const [name, program, book, param] of /** @type {const} */ ([
  ["swirl", swirl, BOOK.swirl, { angle: 2.4 }],
  ["bulge", bulge, BOOK.bulge, { strength: 0.85 }],
])) {
  test(`${name}: the pixel Kernel returns the book's color at a few points (f32 within one panel pixel's tolerance of the doubles)`, () => {
    const { pixel } = pixelOf(program);
    const c = [75, 75];
    for (const [px, py] of POINTS) {
      const u = { ...param, cx: c[0], cy: c[1], t: 0, aspect: 1 };
      const got = pixel([px / 150, py / 150].map(Math.fround), u);
      const want = /** @type {Function} */ (book)(px, py, c, Object.values(param)[0]);
      assert.deepEqual(got, want.map(Math.fround), `${name} at ${px}, ${py}`);
    }
  });

  test(`${name}: the result is a color of three f32s`, () => {
    const { pixel } = pixelOf(program);
    const got = pixel([0.3, 0.6], { ...param, cx: 75, cy: 75, t: 0, aspect: 1 });
    assert.equal(got.length, 3);
    for (const x of got) assert.equal(Math.fround(x), x);
  });
}

test("intrinsics come from the environment: with none, the first call is an error naming it", () => {
  const { pixel } = pixelOf(swirl, { intrinsics: {} });
  assert.throws(() => pixel([0.3, 0.6], { angle: 2.4, cx: 75, cy: 75, t: 0, aspect: 1 }), /intrinsic 'length'/);
});

test("the hook sees a pixel's nodes with spans inside the lambda's source, and its helpers' under their own names", () => {
  /** @type {import("../interp.js").NodeEvent[]} */
  const events = [];
  const { kernel, pixel } = pixelOf(swirl, { onNode: (e) => events.push(e) });
  pixel([0.3, 0.6], { angle: 2.4, cx: 75, cy: 75, t: 0, aspect: 1 });
  const own = events.filter((e) => e.kernel === kernel.name);
  assert.ok(own.length > 20);
  for (const e of own) assert.ok(e.span[0] >= 0 && e.span[0] < e.span[1] && e.span[1] <= kernel.src.length, `${e.path}: ${e.span}`);
  assert.deepEqual([...new Set(events.filter((e) => e.depth > 0).map((e) => e.kernel))].sort(), ["grid", "pmod"]);
  assert.ok(own.some((e) => e.kind === "call" && e.value !== undefined && typeof e.value === "number"), "a call's value is reported");
});
