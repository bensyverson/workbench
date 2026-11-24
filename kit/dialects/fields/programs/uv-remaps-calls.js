// The two uv remaps of uv-remaps.js in call style: no operator on a vector, every vector
// operation a call (vadd, vsub, vscale, ...). Scalars still use operators. Same params, same output.

import { field } from "../index.js";

const GRID = `(q) => {
  const gx = pmod(q.x, 10);
  const gy = pmod(q.y, 10);
  const major = (pmod(floor(q.x / 10), 5) === 0 && gx < 1.2) || (pmod(floor(q.y / 10), 5) === 0 && gy < 1.2);
  if (major) return color(0.886, 0, 0.102);
  if (gx < 1 || gy < 1) return color(0.45, 0.45, 0.45);
  if (length(vsub(q, vec2(75, 75))) < 20) return color(0.84, 0.84, 0.84);
  return color(1, 1, 1);
}`;

const CENTER = /** @type {const} */ ({ cx: { value: 75, min: 0, max: 150, step: 1 }, cy: { value: 75, min: 0, max: 150, step: 1 } });

export const swirlCalls = field("swirl")
  .param("angle", { value: 2.4, min: -8, max: 8, step: 0.1 })
  .param("cx", CENTER.cx).param("cy", CENTER.cy)
  .fn("grid", GRID)
  .pixel(`(uv, u) => {
  const R = 63;
  const c = vec2(u.cx, u.cy);
  let d = vsub(vscale(uv, 150), c);
  const dist = length(d);
  if (dist < R) {
    const pc = (R - dist) / R;
    const th = pc * pc * u.angle;
    const s = sin(th);
    const co = cos(th);
    d = vec2(d.x * co - d.y * s, d.x * s + d.y * co);
  }
  return grid(vadd(d, c));
}`)
  .build();

export const bulgeCalls = field("bulge")
  .param("strength", { value: 0.85, min: 0, max: 1, step: 0.05 })
  .param("cx", CENTER.cx).param("cy", CENTER.cy)
  .fn("grid", GRID)
  .pixel(`(uv, u) => {
  const R = 63;
  const c = vec2(u.cx, u.cy);
  let d = vsub(vscale(uv, 150), c);
  const dist = length(d);
  if (dist < R && dist > 0) {
    const k = mix(1, smoothstep(0, R / dist, dist / R), u.strength * 0.75);
    d = vscale(d, k);
  }
  return grid(vadd(d, c));
}`)
  .build();
