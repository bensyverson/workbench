# DMG oracle

A headless harness around the DMG Workbench's own runtime, used as the reference that M1's emitted code is compared against. It loads the DSL core and presets out of `project/2026-11-23-dmg-workbench.html` at run time; no DMG code is copied into the repo.

- `load.js`: `loadDmg()` returns `{ DSL, presets, preset(id), build(idOrCode) }`. Each `build` call gives fresh closures.
- `lambdas.js`: `lambdaSlots(spec)` lists every runtime lambda with a stable id (`Mole.onFrame#0`, `Whackable.method(whack)`, `timer(spawn).every`, `done`). Fragment lambdas are listed once, under the fragment, with `usedBy`. `swapLambda(spec, id, fn)` replaces one; the runtime reads `fn` live.
- `trace.js`: `runTrace(build, { seed, frames, input, renderEvery })` records every tick: world, all entities (including `visible`/`alive`), a background-map hash and scroll, `oamStart`, that tick's log entries (complete, unlike `rt.log`), and a framebuffer hash on render ticks. `firstDifference(a, b)` names the first differing tick and field.
- `inputs.js`: `inputTrace(seed, frames)` gives seeded button traces with their own PRNG.
- `npm run inventory` writes `out/inventory.json`: every runtime lambda in all presets with kind, owner and source. That is 126 lambdas, and preset 02 has none.

Always pass `seed` explicitly: the DMG UI ignores `Game.seed()` for the runtime RNG. `draw` and `hud` run only at render time, so their effect shows only in `fb`.
