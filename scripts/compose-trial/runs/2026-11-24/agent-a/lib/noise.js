// Shared kernel helpers: value noise, used by the cave (rock) and the glow (flicker).
export const hash = (x, y) => fract(sin(x * 127.1 + y * 311.7) * 43758.5453);

export const noise = (x, y) => {
  const ix = floor(x);
  const iy = floor(y);
  const fx = smoothstep(0.0, 1.0, fract(x));
  const fy = smoothstep(0.0, 1.0, fract(y));
  const top = mix(hash(ix, iy), hash(ix + 1.0, iy), fx);
  const bottom = mix(hash(ix, iy + 1.0), hash(ix + 1.0, iy + 1.0), fx);
  return mix(top, bottom, fy);
};
