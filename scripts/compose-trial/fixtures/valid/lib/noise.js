// Value noise in the kernel subset: compiled to JS for the cave and to GLSL for the torch.
export const hash = (x, y) => fract(sin(x * 127.1 + y * 311.7) * 43758.5453);

export const noise = (x, y) => {
  const ix = floor(x), iy = floor(y);
  const fx = smoothstep(0, 1, fract(x)), fy = smoothstep(0, 1, fract(y));
  const top = mix(hash(ix, iy), hash(ix + 1, iy), fx);
  const bottom = mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx);
  return mix(top, bottom, fy);
};
