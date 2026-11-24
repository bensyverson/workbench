export const hash = (x, y) => fract(sin(x * 127.1 + y * 311.7) * 43758.5453);
export const noise = (x, y) => {
  const ix = floor(x);
  const iy = floor(y);
  const fx = smoothstep(0, 1, fract(x));
  const fy = smoothstep(0, 1, fract(y));
  const a = mix(hash(ix, iy), hash(ix + 1, iy), fx);
  const b = mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx);
  return mix(a, b, fy);
};
