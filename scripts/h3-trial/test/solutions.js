// Reference solutions to the three trial tasks in the typed style, as pixel lambda sources, to show each task
// is solvable with the Dialect's intrinsics. They are not given to trial agents.

export const SOLUTIONS = /** @type {const} */ ({
  vignette: {
    params: { strength: { value: 0.7, min: 0, max: 1 }, radius: { value: 0.5, min: 0, max: 1.5 }, softness: { value: 0.6, min: 0.05, max: 1.5 }, tintR: { value: 1, min: 0, max: 1 }, tintG: { value: 0.9, min: 0, max: 1 }, tintB: { value: 0.75, min: 0, max: 1 } },
    pixel: `(uv, u) => {
  const base = mix(color(0.12, 0.15, 0.2), color(0.85, 0.82, 0.78), uv.y);
  const d = vec2((uv.x - 0.5) * u.aspect, uv.y - 0.5);
  const r = length(d) * 2;
  const k = smoothstep(u.radius, u.radius + u.softness, r);
  const lit = base * (1 - u.strength * k);
  return color(lit.r * u.tintR, lit.g * u.tintG, lit.b * u.tintB);
}`,
  },
  rings: {
    params: { frequency: { value: 24, min: 4, max: 60 }, speed: { value: 3, min: 0, max: 10 }, spokes: { value: 6, min: 1, max: 12, step: 1 }, spokeDepth: { value: 0.4, min: 0, max: 1 }, drift: { value: 0.08, min: 0, max: 0.3 }, sharpness: { value: 0.15, min: 0.02, max: 0.5 } },
    pixel: `(uv, u) => {
  const c = vec2(0.5 + u.drift * cos(u.t), 0.5 + u.drift * sin(u.t));
  const d = vec2((uv.x - c.x) * u.aspect, uv.y - c.y);
  const r = length(d);
  const a = atan2(d.y, d.x);
  const ripple = 0.5 + 0.5 * sin(r * u.frequency - u.t * u.speed);
  const v = 0.5 + (ripple - 0.5) * (1 - u.spokeDepth * (0.5 + 0.5 * cos(u.spokes * a)));
  return mix(color(0.05, 0.25, 0.3), color(1, 0.95, 0.8), smoothstep(0.5 - u.sharpness, 0.5 + u.sharpness, v));
}`,
  },
  kaleidoscope: {
    params: { segments: { value: 6, min: 3, max: 12, step: 1 }, cell: { value: 0.1, min: 0.03, max: 0.3 }, spin: { value: 0.4, min: -3, max: 3 }, offset: { value: 0.2, min: 0, max: 1 } },
    pixel: `(uv, u) => {
  const d = vec2((uv.x - 0.5) * u.aspect, uv.y - 0.5);
  const r = length(d);
  const wedge = 6.2831853 / u.segments;
  let a = pmod(atan2(d.y, d.x), wedge);
  if (a > wedge * 0.5) a = wedge - a;
  const th = a + u.t * u.spin;
  const p = vec2(r * cos(th) + u.offset, r * sin(th));
  const parity = pmod(floor(p.x / u.cell) + floor(p.y / u.cell), 2);
  const plum = color(0.25, 0.08, 0.3);
  const c = mix(plum, color(0.8, 0.95, 0.85), parity);
  return mix(plum, c, smoothstep(0, 0.05, r));
}`,
  },
});
