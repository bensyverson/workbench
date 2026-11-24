// Two-dimensional value noise, in [0, 1). Shared by the cave (rock) and the glow (flicker).
export const hash = (x, y) => fract(sin(x * 127.1 + y * 311.7) * 43758.5453);

export const noise = (x, y) => {
  const ix = floor(x);
  const iy = floor(y);
  const sx = smoothstep(0.0, 1.0, fract(x));
  const sy = smoothstep(0.0, 1.0, fract(y));
  const a = hash(ix, iy);
  const b = hash(ix + 1.0, iy);
  const c = hash(ix, iy + 1.0);
  const d = hash(ix + 1.0, iy + 1.0);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
};
