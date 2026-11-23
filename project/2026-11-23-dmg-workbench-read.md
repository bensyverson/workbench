# What the DMG Workbench actually does

*2026-11-23 · findings · a close read of [`2026-11-23-dmg-workbench.html`](2026-11-23-dmg-workbench.html) (3,162 lines) for M1. Line numbers refer to that file.*

**Headline: the DSL core (lines 509–1553) runs headless in Node unchanged.** Line 1552 is `if (typeof module !== "undefined") module.exports = DSL;`. All 22 presets build and run 600–1,500 frames with no errors. Observed state is repeatable, and it is the same whether `render()` runs every frame or never. That was checked with seed 3, the bot driving, and 1,500 frames, using a throwaway harness that `require`d an extracted copy of lines 510–1552. So the existing runtime can serve as M1's oracle.

## File map

| Lines | Contents |
|---|---|
| 7–8 | The only external load: a Google Fonts stylesheet |
| 509–1553 | DSL core, `var DSL = (function(){…})()`. Constants at 514 (`W=160, H=144, FPS=59.73`); diagnostics, "did you mean" and the builder proxy 516–566; `art`, font, `fmt` printf 568–622; params 624–649; builders 651–794; `compile()` 796–1028; `makeIR()` 1030–1095; `emitC()` 1097–1169; `Runtime` 1171–1512; `run(code)` 1514–1550 |
| 1554 | `window.DMG_PRESETS`: one JSON line, 22 records `{id, group, title, sub, code, notes}`. Ids are 01–08, 10–14, 20–26 and 30–31, not 01–22 |
| 1555–2766 | UI: editor, stage, params, graph, IR and C views, events and REPL, notes, reference |
| 2767–3161 | The agent: lab API 2800–2891, `runEval` 2893, prompt 2911–2980, `lab:` links 2981–3007, model call 3008–3160 |

User code runs through `new Function("Game","component","fragment","slider","toggle","choice","art","$","print", code + "\n//# sourceURL=game.js")` (1515–1521). Every lambda is a live closure. The source text feeds only the regex scan, the lint, the IR's `src` field and the C comments.

## Runtime lambda slots

| Slot | When it runs | Arguments |
|---|---|---|
| component `onFrame` | per alive entity per tick | `(self, w)` |
| world `onFrame` | per tick | `(w, w)` |
| `draw` | in `render()`, **not** the tick | `(self, w)` → sprite name, `{sprite,x,y,flipX,flipY}`, or `null` |
| `hud` (world only) | in `render()` | `(w, at)`, where `at(col,row)` returns `{ink, paper, text(fmt,...args), bar}` |
| `method` | when called | component `(self, ...args)`; world `(w, ...args)` |
| world `on` / component `on` | during event dispatch | `(w, data)` / `(self, data, w)` |
| `init` | at `reset()` and on pool spawn | world `(w, w)`; component `(self, w)` |
| timer fn | when the timer fires | `(w, w)` |
| timer `every` λ | each time the timer re-arms | `(w)` |
| `done` | end of each tick | `(w, w)` |
| `bot` | before the tick, called by the host | `(w, w)` → buttons |

These run at build time instead: `background`, `board` and the grid `pos` callback (at builder call time), and `bake` (once per instance; the fields it adds become read-only constants). When fragments merge, the fragment's parts come **before** the part's own parts (`mergePart`, line 818).

## Runtime semantics a lambda swap must preserve

- **Tick order** (`_tick`, 1418–1441):
  1. Input.
  2. If the game is over: `start` resets it, otherwise only `frame++`.
  3. Timers, in declaration order.
  4. World `onFrame`s.
  5. Entities in index order, checking `alive` as each is visited.
  6. The event queue, FIFO. For each event, world handlers run first, then entity handlers in index order. Events emitted during dispatch are handled in the same frame. Dispatch is capped at 512 per frame, and the queue at 256.
  7. `done`.
  8. `frame++`.
- **Timers:** first fire on tick `max(1, round(ms × 59.73 / 1000))`. Live params are re-read only when the timer re-arms.
- **Entity order** is the order of builder calls across `place`, `board` (row-major) and `pool`. `w.spawn` takes the first dead slot. An entity spawned mid-tick with a higher index than the current one runs in the same tick.
- **RNG:** xorshift32 (line 797). The runtime seed is `rng32(seed * 2654435761)`. `w.rng.pick([])` returns `undefined` **without drawing**, so the RNG stream depends on filter results. The UI and `test()` always pass seed 1 and ignore `Game.seed()` for the runtime RNG. Pass the seed explicitly.
- **Numbers** (`coerce`, 1201–1223): coercion happens only when a typed attribute is stored through the proxy. The order is clamp, then truncate, then wrap.

  > **Corrected 2026-11-23:** wrong order. `coerce` truncates first (warning when a fraction is lost), then clamps to `min`/`max`, then wraps; `fix` rounds to 1/256 before it clamps. See the marked correction in [the M1 plan](2026-11-23-m1-game-slice-plan.md), "Integer semantics in the IR".

  Locals, `x`/`y`, params and `w.frame` are plain doubles. An assignment expression evaluates to the unwrapped value: `--self.ttl` on a u8 holding 0 yields −1 while 255 is stored.
- **Input:** buttons `up down left right A B start select`. `pressed` and `released` are edges. `repeat` is true at a hold count n when `n===1 || (n>14 && (n-14)%5===0)`.
- **Observable state:** `rt.obs()` (1388) omits baked constants, `visible`, timer, RNG and input state, `oamStart`, and **the BG map**, which holds game state in Snake, Breakout, Flappy, Lights Out and Life. `rt.log` is capped at 600 entries; use `hooks.onLog` for the full trace. `draw` and `hud` run at render cadence (the UI renders after 0–10 ticks, `test()` every 4), so a side effect in them would make results depend on cadence. No preset has one.
- **Headless API:** `DSL.run(code, {overrides}).build.runtime({seed, params, hooks})`, then `.reset()`, `.step(buttons, {frames})`, `._tick(buttons)`, `.render()`, `.obs()`, `.mutate(fn)`, `.set(k, v)` and `.botInput()`.

## The runtime subset against the presets

Run against the proposal's §5.5, the presets break it in these ways (runtime lambdas only):

- **A callback passed to an array method:** 9 of 22 presets (04, 05, 06, 10, 11, 12, 13, 21, 24). Most often `w.rng.pick(w.board.filter((m) => !m.up))`. Others are `reduce`, `find`, and `filter` with `Math.abs`.
- **Top-level helper functions or constants called from runtime code:** 6 presets (14, 21, 22, 23, 25, 26), for example `placeFood(w)`, `isBrick` and `step(w)`. `.const()` does not cover functions.
- **`Math.*`** in 9 presets: max, min, floor, abs, sign, sin, cos, PI.
- **Strings as runtime values:** concatenation (`"LIVES " + "@".repeat(n)`), `.endsWith`, enum values used as sprite names, and tile names returned by `w.bg.get`.
- **Literals and destructuring:** `for (const p of [w.player, w.cpu])`, `const [dx, dy] = DIRS[w.dir]`, spread, and `const { cx, cy } = w.bg.cell(…)`.
- **Others:** untyped event payloads (about 9 presets); nested closures (21, 22); a dynamic property name `self[axis]` (22); an unbounded `while` (23); `new Uint8Array` every step (26); a regex (22); return types that mix strings, objects and `null` in `draw`.

Rough H1 estimate: about 4 presets are clean as written (01, 02, 03, 08). About 6–8 more need only a filter/query construct plus `Math` intrinsics. The other games (20–26) need declared helpers, string values, literals and destructuring.

Presets 01–05 barely exercise the runtime. None reads input, emits events, spawns, or uses fragments, a world `onFrame`, `done`, `bot` or `fix`, and only 04 uses the RNG. In 01–03 the only runtime code is `draw`/`hud`.

## The existing IR and C emitter

- **`makeIR`** (1031–1095) builds a visualization DAG (`{nodes, edges}`), not an executable IR.
  - Edges come from regex scans of `String(fn)`: `emit("x"`, `param("x"`, method calls, and so on.
  - A lambda body is kept only as its `src` string. Its `line` is the line of the builder call, not the lambda's own span.
  - Nothing consumes it except the views and the agent.
- **`emitC`** (1102–1169) gets the data right: tiles, the BG map, structs per component, `#define`s for folded params, and baked arrays. It writes lambdas as comments inside empty functions, and only some of them: component methods and `onFrame`s, timer bodies, and the first world `on` handler per event. It omits `draw`, `hud`, component `on`, world `onFrame`, `init`, `done` and `bot`. Its output would not compile (`MS_TO_FRAMES` is used before it is defined, and a global is initialized from a non-constant), and it times at 60 fps with truncation where the runtime uses 59.73 with rounding.

## The agent and the docs

- **Eval tool:** `runEval` (2893) runs agent code as an async strict function body with a 25 s timeout and returns YAML capped at 9,000 characters. Its scope includes `files`, `build`, `diagnostics`, `inspect`, `step`, `mutate`, `screen` (80×36 characters), `test`, `emitC`, `w` and `rt`.
- **`test()`** (2832–2857) is most of a differential harness already. It lacks only a trace output.
- **`mutate(fn)`** writes through the typed proxy and logs. There is no separate "mutation mode"; the agent's modes are auto, ask and read-only.
- **Model call:** `window.claude.use("sample")` with one `eval` tool.
- **Docs:** there is no textbook. Each preset has `notes` HTML, and the reference view is built from a `REF` array. `lab:` links appear only in agent replies, in four kinds: `line`, `node`, `view`, `preset`.

## Corrections to the proposal

To be applied in place by M1's report leaf:

- **L5** overstates the C emitter's coverage, and its output does not compile.
- **L11:** the docs have no `lab:` links; only agent replies do.
- **L2:** there is no "mutation mode", only a function plus a REPL.
- **Preset ids** are not 01–22.
- **§5.8's** example wraps before comparing; the runtime compares the unwrapped value. Preset 10's `ttl` is also u16, not u8.
