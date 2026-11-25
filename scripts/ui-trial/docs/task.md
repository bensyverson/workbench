# The task: two packages, two UIs

*2026-11-25, second trial. Each package below already has its Dialect and Grammar (in its folder, with one example Program). Each Dialect describes the host's state in a comment above `text(state)` but does not declare it: first declare it as the Dialect's `state` (`ui-draft.md`, "The state"), then write the UI with `ui-draft.md`. The items are numbered so your report can answer each one.*

## Particles (`particles/`)

A particle system: emitters spawn particles that forces push around a box until they die. Programs declare params (`$.rate`, `$.wind` …), counters (`burnedOut` …) and emitters; every Program differs. The host's state after each tick is described in a comment above `text(state)` in `particles.dialect.js`: the time, the cap (`maxParticles`), the box, every live particle's position, each emitter's live count and each counter's value.

A person tuning a fountain wants to see:

1. **Live particles** against the cap, red when the system is full; and the **time**.
2. **Each emitter's live count**, one row per emitter.
3. **Each counter's value**, one row per counter.
4. A **check** that stays green while the system is under its cap.
5. A **plot** of live particles over the last 10 seconds.
6. A **chart of runs**: live particles after 5 seconds of run time, for the param `rate` from 0 to 400 (Programs without `rate` simply show nothing). The tick is the Program's; take it as 1/30 s.
7. A **stage** that draws every particle as a dot in the box, as a custom element; a click on it reports the point clicked as a pick. Write its module (short: a canvas and a click handler is enough).
8. A **note** on the `t` trace saying what it is, and a **badge** on the `rate` param control that reads "hot" above 300.
9. Lay it out: the readouts in a tile beside the stage, the chart of runs in a tab with it.

## Maze (`maze/`)

A small game: a player walks a grid of walls (`#`) and coins (`c`), steered by a D-pad; A dashes, B waits. Its Dialect hands each tick's `control` lambda the player and a `Pad` object of six booleans (read `maze.dialect.js`); the host's state is described above its `text(state)`.

The host, in prose (not built): each tick it samples the buttons into `Pad`, runs `control`, then walks the player `steps` cells in the direction `(dx, dy)`, stopping at a wall; walking onto a coin removes it and adds one to `score`.

10. **Inputs:** the D-pad and the two buttons, mapped so a host can drive them from keys, an on-screen pad or a gamepad; the on-screen buttons for A and B say "Dash" and "Wait".
11. A **stage**: the text view is enough. (You may add a custom element that draws the grid; if you do, write its module.)
12. **Score** and **coins left** readouts, below the stage; a **check** "all coins" that turns green when none are left.
13. A **plot** of the score over the last 30 seconds.

## Composition (answer in your report; there is nothing to check)

14. Suppose one page holds both packages, say a maze whose coins burst into particles. Using only what `ui-draft.md` says, how would the maze UI place its score tile beside the particles stage, and how would either package annotate the other's views? What does the draft leave unsaid?
