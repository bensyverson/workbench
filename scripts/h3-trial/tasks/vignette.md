# Task: vignette

Write a field named `vignette`: a smooth two-color backdrop that darkens toward the edges and takes on a color tint.

- The backdrop blends vertically from a deep blue-gray at the bottom of the image (`uv.y = 0`) to a pale warm gray at the top (`uv.y = 1`).
- The vignette darkens it by distance from the center of the image. Distance must be measured so that the falloff is **circular on screen**, not stretched with the image: use `u.aspect` (width over height) to correct the horizontal offset. Inside `radius` (a fraction of the half-height) there is no darkening; beyond it the light falls off smoothly to `1 - strength` at distance `radius + softness`, and stays there further out.
- Finally the result is multiplied by a tint color (so a white tint changes nothing).

Params: `strength` (0 to 1, default 0.7), `radius` (0 to 1.5, default 0.5), `softness` (0.05 to 1.5, default 0.6), and the tint as three params `tintR`, `tintG`, `tintB` (0 to 1, default a warm 1.0, 0.9, 0.75).

Sanity checks: at the center the color is the backdrop's middle blend times the tint; at a corner it is noticeably darker than at the center; `strength` 0 removes the vignette entirely.
