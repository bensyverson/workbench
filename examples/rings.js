import { field } from "../kit/dialects/fields/index.js";

// Concentric rings, `n` of them layered. The lambda is a string the kit parses; it is never run as plain JavaScript.
export const rings = field("rings")
  .param("k", { value: 4, min: 0, max: 8 })
  .param("n", { value: 3, min: 1, max: 8 })
  .pixel(`(uv, u) => {
    let sum = 0;
    for (let i = 0; i < u.n; i++) {
      sum += sin(length(uv - vec2(0.5, 0.5)) * u.k * 6.28 + i);
    }
    return mix(color(0, 0, 0), color(1, 1, 1), pmod(sum, 1));
  }`)
  .build();
