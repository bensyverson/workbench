# Task: rings

Write a field named `rings`: concentric ripples that travel outward from a center, in polar coordinates, with a spoked modulation around the center.

- The center is at `(0.5, 0.5)` plus a small circular drift: it moves on a circle of radius `drift` around the middle as `u.t` advances (one revolution every 2 pi seconds).
- Take the offset from that center (correct its horizontal part with `u.aspect` so the rings are circles on screen), and work in polar form: the distance `r` from the center and the angle `a` (`atan2`) around it.
- The ripple is `0.5 + 0.5 * sin(r * frequency - u.t * speed)`.
- The spokes: multiply the ripple's contrast by `1 - spokeDepth * (0.5 + 0.5 * cos(spokes * a))`, so the rings are strongest along some directions and weaker along others. `spokes` is a whole number of spokes.
- The result mixes between a dark teal and a bright cream by the combined ripple value, sharpened with `smoothstep(0.5 - sharpness, 0.5 + sharpness, ripple)` where `sharpness` is small for crisp rings and large for blurry ones.

Params: `frequency` (4 to 60, default 24), `speed` (0 to 10, default 3), `spokes` (1 to 12, whole numbers, default 6), `spokeDepth` (0 to 1, default 0.4), `drift` (0 to 0.3, default 0.08), `sharpness` (0.02 to 0.5, default 0.15).

Sanity checks: with `spokeDepth` 0 and `drift` 0 the picture is exactly symmetric around `(0.5, 0.5)`; at `t = 0`, `speed` has no effect.
