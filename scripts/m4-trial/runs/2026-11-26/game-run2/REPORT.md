## Difficulty
2 of 5. The first `./check.sh` run was clean. The work was mostly reading, and joining facts about the pad and queue sizes that are spread over several pages.

## What I built
`gemgrid/`, a grid-game Dialect with a runtime, a Draw-stage UI, one level (`examples/cavern.js`) and five refusal modules.

A Program is `gemgrid("name").map([...rows]).pace(0.15)`. In a row, `#` is a wall, `.` floor, `*` a gem and `P` the start. `pace` is optional (0.05 to 1 s, default 0.15). A map is at most 24 by 24, with rows of equal length, exactly one `P` and at least one gem.

A newly pressed direction moves one cell at once, and holding it repeats every `pace` seconds. Walls and the grid's edge block.

Ports:
- `in.move`: the page pad's seam exactly (wire `page.out.pad` to it).
- `out.picked`: `Event<{ at: point2@cell }>`, the center of the picked gem's cell.
- `out.score`: the number of gems picked up.
- `out.player`: `point2@cell`. The task did not ask for this one.
- `out.view`: `Draw<1154>@px`, 16 px per cell.

Frames are `cell` and `px`, both with extents, joined by an edge of scale 16.

What was verified:
- `./check.sh gemgrid` exits 0.
- The five refusals are in the manifest. The checker enforces their codes: a deliberately wrong one gave K014.
- The checker does not test pickups or repeat timing. I ran a copy of the runtime in plain Node with `defineRuntime` and the grammar stubbed out, then deleted the copy. A tap moved once and picked up a gem, a wall blocked, and a held direction moved at steps 0, 9, 18, ... (0.15 s at 60 Hz). This was not a run under kit/run.
- I did not look at the rendered picture.

## Where the docs misled me
Nothing turned out wrong. Two snippets were incomplete:
- `docs/kit/API.md`, "A runtime": the snippet shows only `events: { out }`. An Event input also needs `events.in`, which I found in `define/README.md`.
- `docs/kit/API.md`, "A runtime": `step`'s second argument is listed as `{ dt, kernels, controls, inputs, events, rng }`. `record`, which I needed, appears only in `run/README.md`.

## What I guessed
- `slots: {}` is allowed for a Dialect with no lambdas. It is.
- Movement: the most recently pressed direction wins. If several are pressed in one record, the order is up, down, left, right. Releasing it falls back to another held direction, which moves after one `pace`.
- The clock is a 1/60 s tick. `in.move` therefore takes 8 records per step (compose README's rule: 2 per 1/240 s frame in the period), and `picked` pushes at most 9.
- `move` is reliable, so taps are not lost. A composer whose producer sends more than the pad does gets S116 and must choose an overflow policy.
- A pickup's `at` is the cell's center, and the `cell` frame is continuous, so that it converts well into another package's space.
- Gems on the start cell cannot be written, since one character describes each cell.
- Walls and floor are plain rects, because the image has no wall cell.
- The Draw ceiling of 1154 is the sum of the layers' maxes. Each Program's own max is `2 + width * height`, at most 578.

## APIs I fought
None made me rewrite anything.

## Gaps
- An author has no documented way to script a run of one package and assert on its state or Events (here: "this input picks up this gem"). `kit/run` documents this for a composed workbench, but a package may not import it and the game check takes no assertions. Smallest change: let a package list run tests in its manifest (an example, scripted pad inputs, expected values) for the checker to run.

## Docs I could not reach
None needed. The documentation links to drafts, scripts and `.d.ts` files outside `docs/`, and I did not follow them.

## Checker runs
4 runs:
1. Clean.
2. K014, from a deliberately wrong refusal code, to confirm refusals are checked.
3. Clean.
4. Clean (final confirmation).
