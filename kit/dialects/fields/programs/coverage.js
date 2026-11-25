// A sketch that calls every intrinsic and every call-style operator of the fields Dialect, so the harness runs each
// spelling on the GPU (the book's sketches leave `fract`, `min`, `max`, `sqrt`, `atan2` and the six `v…` calls unrun).
// It is not a picture: every term stays inside the domain where GLSL and JavaScript agree (no `sqrt` of a negative, no
// `pow` with a negative base, no `atan2(0, 0)`, no divisor near zero, no `smoothstep` with equal edges).

import { field } from "../index.js";

export const coverage = field("coverage")
  .param("k", { value: 3, min: 1, max: 6, step: 0.1 })
  .param("shift", { value: 0.25, min: -1, max: 1, step: 0.05 })
  .pixel(`(uv, u) => {
  const p = vec2(uv.x, uv.y);
  const q = vmul(p, vec2(u.k, 2));
  const w = vdiv(vadd(p, vec2(1, 1)), vsub(vec2(3, 3), p));
  const n = vneg(vscale(q, 0.25));
  const m = vec2(max(q.x * 0.2, w.x), min(q.y, w.y));
  const v3 = vmul(vec3(p.x, p.y, 0.5), vec3(1, 2, 3));
  const v3n = vneg(vscale(v3, 0.2));
  const a = fract(q.x * 0.5 + u.shift);
  const s = sqrt(p.x * p.x + p.y * 2) / 1.8;
  const ang = atan2(p.y - 0.513, p.x - 0.5) / 3.2;
  const wl = length(vsub(w, vec2(0.4, 0.3)));
  const e = pow(1 + p.x, 1.5) / 3;
  const sm = smoothstep(0.2, 0.9, p.y);
  const h = ihash(floor(q.x * 8), floor(q.y * 8), 3);
  const r = mix(a, s, sm);
  const g = clamp(abs(ang) + abs(n.x) + 0.2 * sin(q.x * 6 + u.t), 0, 1);
  const b = mix(h, cos(wl * 5) * 0.5 + 0.5, 0.5) * 0.7 + 0.3 * e;
  return color(clamp(r + m.x * 0.1 + abs(v3n.x), 0, 1), clamp(g + m.y * 0.1 + abs(v3n.z), 0, 1), clamp(b + abs(v3n.y), 0, 1));
}`)
  .build();
