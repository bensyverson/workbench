// The Uncommon Math book's 04-noise/domain-warp as a fields Program: Quilez-style domain
// warping, f(p + k * r) with r = fbm(p + k * q), q = fbm(p). The noise is the Library's `fbm`
// (five octaves of `vnoise`, over the `ihash` intrinsic). The book's frag takes pixel
// coordinates (x = px * scale / w, y = (h - py) * scale / w); here `uv` is the unit square with y up,
// so p = (uv.x * scale, uv.y * scale / aspect), where aspect is width over height.

import { field } from "../index.js";

export const domainWarp = field("domain-warp")
  .param("k", { value: 4, min: 0, max: 8, step: 0.25 })
  .param("levels", { value: 2, min: 0, max: 2, step: 1 })
  .param("scale", { value: 3, min: 1, max: 8, step: 0.5 })
  .param("palette", { value: "fog", options: ["fog", "grey", "marble"] })
  .param("seed", { value: 1, min: 1, max: 99, step: 1 })
  .pixel(`(uv, u) => {
  const s = u.seed * 3;
  const k = u.k;
  const p = vec2(uv.x * u.scale, uv.y * u.scale / u.aspect);
  let q = vec2(0, 0);
  let r = vec2(0, 0);
  let f = 0;
  if (u.levels === 0) f = fbm(p, s);
  else {
    q = vec2(fbm(p + vec2(0.03 * u.t, 0), s), fbm(p + vec2(5.2, 1.3), s));
    if (u.levels === 1) f = fbm(p + k * q, s);
    else {
      r = vec2(fbm(p + k * q + vec2(1.7 + 0.15 * u.t, 9.2), s), fbm(p + k * q + vec2(8.3, 2.8 + 0.126 * u.t), s));
      f = fbm(p + k * r, s);
    }
  }
  if (u.palette === "grey") {
    const g = clamp((f - 0.2) / 0.6, 0, 1);
    return color(g, g, g);
  }
  let B = color(0.051, 0.039, 0.102);
  let L = color(0.169, 0.102, 0.431);
  let M = color(0.851, 0.271, 0.42);
  let H = color(1, 0.722, 0.42);
  if (u.palette === "marble") {
    B = color(0.03, 0.08, 0.06);
    L = color(0.1, 0.27, 0.22);
    M = color(0.31, 0.56, 0.47);
    H = color(0.94, 0.91, 0.83);
    const stripe = 0.5 + 0.5 * sin(2.2 * (p.x + p.y) + 9 * f);
    const vein = pow(1 - stripe, 6);
    const n = clamp((f - 0.25) / 0.5, 0, 1);
    const c = n < 0.5 ? mix(B, L, n * 2) : mix(L, M, n * 2 - 1);
    return mix(c, H, 0.9 * vein);
  }
  let c = mix(B, L, clamp(f * f * 4, 0, 1));
  c = mix(c, M, clamp(length(q), 0, 1));
  c = mix(c, H, clamp(abs(r.x), 0, 1));
  return mix(B, c, f * f * f + 0.6 * f * f + 0.5 * f);
}`)
  .build();
