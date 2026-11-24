# Task: kaleidoscope checker

Write a field named `kaleido`: a checkerboard seen through a rotating mirror fold.

- Start from the position relative to the middle of the image, `(0.5, 0.5)`, with its horizontal part scaled by `u.aspect` so squares stay square on screen.
- Fold it into a kaleidoscope: express the position in polar form (distance `r`, angle `a` from `atan2`), then reduce the angle into one wedge of `2 pi / segments` and **mirror** every other wedge, so neighboring wedges are reflections of each other. (One way: take `a` modulo the wedge width with `pmod`, then replace it with `wedge - a` when it is past half a wedge, which makes a triangle wave of the angle.) Rebuild the folded position from `r` and the folded angle with `cos` and `sin`.
- Rotate the folded position by `u.t * spin` radians about the middle, and move it by an `offset` along x so the pattern drifts.
- Lay a checkerboard over the result: cells `cell` wide (a fraction of the image height); cells alternate between two colors, a deep plum and a pale mint, by whether `floor(x / cell) + floor(y / cell)` is even or odd (use `pmod` for the parity).
- Fade the pattern toward the plum at the very center (within `0.05` of the middle) so the point where all wedges meet is not a hard seam: mix by `smoothstep(0.0, 0.05, r)`.

Params: `segments` (3 to 12, whole numbers, default 6), `cell` (0.03 to 0.3, default 0.1), `spin` (-3 to 3, default 0.4), `offset` (0 to 1, default 0.2), plus any others you find you need (at most two).

Sanity checks: the picture is mirror-symmetric about every wedge boundary; changing `segments` changes the number of wedges; at `t = 0` and `offset = 0` `spin` has no effect.
