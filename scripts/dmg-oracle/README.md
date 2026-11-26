# DMG oracle

A headless harness around the DMG Workbench's own runtime, used as the reference that M1's emitted code is compared against. It loads the DSL core and presets out of `project/2026-11-23-dmg-workbench.html` at run time; no DMG code is copied into the repo.

- `load.js`: `loadDmg()` returns `{ DSL, presets, preset(id), build(idOrCode) }`. Each `build` call gives fresh closures.
- `lambdas.js`: `lambdaSlots(spec)` lists every runtime lambda with a stable id (`Mole.onFrame#0`, `Whackable.method(whack)`, `timer(spawn).every`, `timer(spawn).after`, `done`, `bot`). Fragment lambdas are listed once, under the fragment, with `usedBy`. `swapLambda(spec, id, fn)` replaces one; the runtime reads `fn` live.
- `trace.js`: `runTrace(build, { seed, frames, input, renderEvery, bot, params })` records every tick (fields below). `firstDifference(a, b)` names the first differing tick and field; a tick where only one run failed is reported as `error`, and a shorter trace differs at `(missing tick)`.
- `encode.js`: the one encoding for every compared value. It is JSON-safe and keeps apart what JSON merges: NaN, undefined, -0 and the infinities become `{ "$": tag }` objects, an entity or the world inside a payload becomes `{ "$": "entity", kind, index }` / `{ "$": "world" }`, and a user object with its own `$` key is wrapped so it can't pass for a tag.
- `inputs.js`: `inputTrace(seed, frames)` gives seeded button traces with their own PRNG.
- `declarations.js`: `declarationsOf(spec)` reads what a built program declares (attribute types, baked constants, methods, params, pools, the board, aliases, sounds) into the plain data `kit/dialects/dmg` builds its dialect from.
- `toplevel.js` (a re-export of [kit/parse/toplevel.js](../../kit/parse/toplevel.js), which also serves the Definition API's module scope): a scan of the program's syntax tree (acorn) that finds which lambdas use top-level bindings of their preset program (see below), and `topLevelBindings(code)`, which gives each top-level `const`/`let`'s initializer source so the pipeline can lower helpers. `build(...)` keeps the program's source on the build as `code`.
- `npm run inventory` writes `out/inventory.json`: every runtime lambda in all presets with kind, owner, source and `topLevelRefs`. That is 126 lambdas, and preset 02 has none.

Always pass `seed` explicitly: the DMG UI ignores `Game.seed()` for the runtime RNG.

## What a tick records

`frame`, `over`, `reason`, `world`, `ents` (kind, alive, visible, x, y, attributes), `bg` (`hash` of tile indices, `glyphs` hash of the tile names they point at, scroll), `oamStart`, `rng` (RNG draws this tick), `bot` (what the bot chose, when the build has one), `log` (complete, unlike `rt.log`, which caps at 600), `fb` (framebuffer hash on render ticks) and `error`. A run stops on its first runtime error.

- **Rendering is on by default** (`renderEvery` 4, as the DMG's own agent run), because `draw` and `hud` run only at render time and show only in `fb`. Pass `renderEvery: 0` to skip it.
- **Bots run on every tick** of a build that has one, and what they choose is recorded, so swapping a bot always shows. The bot drives input when no `input` is given (as the DMG's agent run does); pass `bot: true` to force it alongside an input trace.
- **`params`** are live params, applied after construction (the runtime's own `params` option throws, because it logs before its log exists) and followed by one reset so timers are armed with them. Unknown and build-time params throw. Draws made by reset-time inits are not counted in `rng`.
- Tests pinning each field and each slot kind are in `test/trace-coverage.test.js` and `test/slots.test.js`. They were checked by single-line mutation: changing or dropping a field, or making a swap a no-op, must fail a test.

## Top-level bindings (a parse-coverage caveat)

A lambda is re-evaluated from `String(fn)`, so a lambda that calls a helper or reads a constant declared at the top of its preset program loses it. The inventory marks each such lambda with a non-empty `topLevelRefs`: 11 of the 126, in presets 14, 21, 22, 23, 25 and 26. They parse, but their source alone is not the whole program: lowering counts each such free identifier as a rejection (M1 plan, Parser rulings), and the differential run cannot swap them like for like. A parse count that includes them overstates coverage.

The scan is lexical, not a parser. It can over-flag (a shadowing local it didn't see), and its flat scope can miss a top-level name hidden by an inner arrow's parameter. Neither occurs in the 22 presets. The 11 match an independent probe that re-evaluated every lambda's source in global scope: 10 changed the run, and the eleventh is preset 21's bot, which the old trace never ran.
