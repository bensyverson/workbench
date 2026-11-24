// Two of the Uncommon Math book's uv remaps (13-filters/uv-remaps: swirl and bulge, as glfx
// writes them), as fields Programs. The book's `maps` take pixel coordinates in a 150-pixel
// panel; here `uv` is the panel's unit square, scaled back to pixels so the numbers are the
// book's. The lens center is a param (the book moves it with the mouse), its radius fixed at 0.42 * 150.

import { field } from "../index.js";

/** The source image the remap samples: a 10-pixel grid, every fifth line red, with a grey disc. */
const GRID = `(q) => {
  const gx = pmod(q.x, 10);
  const gy = pmod(q.y, 10);
  const major = (pmod(floor(q.x / 10), 5) === 0 && gx < 1.2) || (pmod(floor(q.y / 10), 5) === 0 && gy < 1.2);
  if (major) return color(0.886, 0, 0.102);
  if (gx < 1 || gy < 1) return color(0.45, 0.45, 0.45);
  if (length(q - vec2(75, 75)) < 20) return color(0.84, 0.84, 0.84);
  return color(1, 1, 1);
}`;

const CENTER = /** @type {const} */ ({ cx: { value: 75, min: 0, max: 150, step: 1 }, cy: { value: 75, min: 0, max: 150, step: 1 } });

export const swirl = field("swirl")
  .param("angle", { value: 2.4, min: -8, max: 8, step: 0.1 })
  .param("cx", CENTER.cx).param("cy", CENTER.cy)
  .fn("grid", GRID)
  .pixel(`(uv, u) => {
  const R = 63;
  const c = vec2(u.cx, u.cy);
  let d = uv * 150 - c;
  const dist = length(d);
  if (dist < R) {
    const pc = (R - dist) / R;
    const th = pc * pc * u.angle;
    const s = sin(th);
    const co = cos(th);
    d = vec2(d.x * co - d.y * s, d.x * s + d.y * co);
  }
  return grid(d + c);
}`)
  .build();

export const bulge = field("bulge")
  .param("strength", { value: 0.85, min: 0, max: 1, step: 0.05 })
  .param("cx", CENTER.cx).param("cy", CENTER.cy)
  .fn("grid", GRID)
  .pixel(`(uv, u) => {
  const R = 63;
  const c = vec2(u.cx, u.cy);
  let d = uv * 150 - c;
  const dist = length(d);
  if (dist < R && dist > 0) {
    const k = mix(1, smoothstep(0, R / dist, dist / R), u.strength * 0.75);
    d = d * k;
  }
  return grid(d + c);
}`)
  .build();
