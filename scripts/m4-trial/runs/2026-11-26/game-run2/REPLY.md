*Saved by the integrator: the leg's closing reply (turns 22, 105 s, $0.62).*

**Difficulty: 2 of 5.**

The hardest part was sizing the D-pad input queue. The facts are spread out: `API.md`'s runtime snippet shows only `events.out`, the `events.in` requirement is in `define/README.md`, and the per-step bound has to be worked out from the page's rule in `compose/README.md`. For a 1/60 s tick that comes to 8 pad records per step, so at most 9 pickups per step (one per record plus one held repeat).

The package is in `gemgrid/` and the write-up is in `REPORT.md`. `./check.sh gemgrid` exits 0. The checker doesn't test pickups or repeat timing, so I tested those with a stubbed copy of the runtime in plain Node, not under the kit's scheduler. I didn't look at the rendered picture.
