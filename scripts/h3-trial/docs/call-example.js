import { field } from "fields";

// Diagonal stripes over the unit square: `count` stripes, tilted by `angle`, with soft edges.
export default field("stripes")
  .param("count", { value: 8, min: 1, max: 30, step: 1 })
  .param("angle", { value: 0.6, min: 0, max: 3.14, step: 0.05 })
  .param("softness", { value: 0.1, min: 0.01, max: 0.5, step: 0.01 })
  .fn("rotate", `(p, a) => vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a))`)
  .pixel(`(uv, u) => {
  const p = rotate(vsub(uv, vec2(0.5, 0.5)), u.angle);
  const band = smoothstep(0.5 - u.softness, 0.5 + u.softness, fract(p.x * u.count));
  return mix(color(0.1, 0.1, 0.3), color(0.9, 0.8, 0.4), band);
}`)
  .build();
