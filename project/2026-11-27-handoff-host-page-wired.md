# Handoff: Ben's three rulings built, the host page wired to declared Controls, every review fixed

*2026-11-27, end of session 9. Picks up after [the declared Controls handoff](2026-11-27-handoff-controls-built-and-reviewed.md) (`17ee191`). This session's commits are `3a50438..` HEAD. Ben was around at the start and ruled the three open decisions; every later call the integrator made is listed under "Decisions made by the integrator", each a two-way door.*

## Needs Ben's eyes

- **A hand check of the page in a real browser.** No agent here has a browser, so nothing in kit/page/host has been seen running since the editor stage, Grips and write-back landed. Serve the repo root (`python3 -m http.server 8765`) and open `/kit/page/host/index.html?packages=/examples/lens/&preset=lens/examples/bench.js`: drag a lens's Grip, release, and check the text in the editor changes, Undo restores it, and a scrub back keeps the text.
- **`examples/` is a new top-level folder** (the lens bench, `examples/lens/`), made by host-73: kit/page's fixture cannot be served, and `kit/test/browser-safe.test.js` refuses a package inside `kit/`. Move it if you want packages elsewhere.
- **The integrator's rulings on the stage review** (below, 4–7), written as dated block quotes in [the controls draft](2026-11-27-controls-draft.md). Each is a two-way door; say if one is wrong.

## What happened

1. **Ben ruled the three decisions** (notes on each issue):
   - `qsEYlW`: an outside input makes an instant for the demand parts it reaches (`916b2fd`, instants-69). Beside a running clocked part it still does not; Ben: keep that until a workbench needs it, and be ready (`1qtKOe`, parked in [the backlog](backlog.md) with three ways to add it).
   - `IlUYzu`: a Ref id's `#<n>` counts per slot (`456e4ac`, refids-70).
   - `ZNpW0f`: keyed Controls and Controls with `to` are part-qualified, `<part>.<control>` (`b62c9a7`, keyed-71), plus a rounding of released values and the first split of page.js.
2. **`afe0cfc` reviewed** (reviewer-afe-72): both loose ends the last handoff named were real; fixed in `8b35b96` (pagefix-75), with the Grips block split out of page.js.
3. **The three rulings' commits reviewed** (reviewer-76): one high (a shared Control won over a part's own scoped one, silently), two mediums (a back-stamped input made a rewind diverge; a demand-only replay was quadratic) and lows. Fixed in `c94c419` (fixa-77) and `15bed68` (fixb-78), and verified by a second review (reviewer-80), whose one regression (a stepped value snapped past its max) the integrator fixed in `9d3463c`.
4. **`GR66N2`, the host page, built** in two halves: forms-74 (`a4edf1e`: vector, points and pick widgets, gamepad and MIDI listening; its tests were written after the code, so a 39-mutant pass made each go red and found a pick-key bug) and host-73 (`a44181b`, `cb1d699`: the editor stage, write-back and undo, Grips over the canvas, zoom and pan, a custom element's events, `page.writeProblem` and `page.fromStage`, main.js split). host-73 also found that kit/run kept the old record on a same-key rebuild, fixed in `15bed68`.
5. **The host page reviewed** (reviewer-79): one high (a scrub back past a write-back left text and record disagreeing for good), three mediums (a release took effect only at the next instant, so Grips went disabled and nothing happened while paused; a device or a non-number widget wrote back on every message) and lows. Fixed in `fc25199` (hostfix-81), which also adds `run.inputNow` to kit/run.
6. **`fc25199` reviewed** (reviewer-82): every finding fixed, and 400 fuzzed runs of `inputNow` showed no divergence from replay, but one regression: a preview logged through `run.input` could sort after a later `inputNow` commit and override it. Fixed in `a5a41d8` (order-83) in the host and page, not kit/run: every preview and commit now goes through `inputNow`, so log order is effect order. kit/run's `inputNow` cannot tell a host action from a preloaded future log (an opened failed test), so its README names the trap instead.
7. **`a5a41d8` reviewed** (reviewer-84): ordering, opening a failed test and the fuzz held, but every preview's 1 ms `inputNow` bump reset the driver's place, so live time ran about 6% fast during a drag. Fixed in `599bf88` (drift-85): the run counts its jumps (`run.jumps`), and the driver resets only on a real jump.

The container `1ymuQu` (declared Controls) is closed.

## Decisions made by the integrator

1. **A Grip release is rounded** to its step, or else only float noise goes (within a few ulps of the 15-digit form); a stepped value snaps from its minimum and is clamped into its bounds.
2. **A dotted part name is S102** in kit/compose (it crashed createRun).
3. **H014 also covers** a device record dropped because the page threw on it.
4. **The text is the source of truth; a rewind is a branch of the run, not of the text.** After a scrub, seek or rewind, the host puts the text in force again when the record differs, and Apply of an unchanged text rebuilds then.
5. **A release, an install and every preview take effect at once** (since `a5a41d8`, running too; a preview in a tick-only run lands up to a tick sooner than before) (`run.inputNow`). With it, runUntil, advance and rewind apply every input stamped by their target even while a display run waits on an unlogged frame; only `step()` still waits (kit/run README, marked correction).
6. **A device commits once per gesture**: a Control with `to` previews while its messages flow and commits after 300 ms of no message, by device time (`GESTURE_IDLE_MS`).
7. **Every widget kind with `to` previews on input and commits on change**, and is drawn disabled with its H011.

## What landed

| Commit | Leaves | What |
|---|---|---|
| `456e4ac` | IlUYzu | Ref ids count per slot |
| `916b2fd` | qsEYlW | Outside inputs make instants in a demand-only run |
| `d03982e` | 1qtKOe | Parked: instants beside a clocked part |
| `b62c9a7` | ZNpW0f | Part-qualified keyed Controls; rounding; controls.js split |
| `8b35b96` | xSF20q OttHk8 gLzzcv | grip-desk.js split; param commit checked without a build; object literals in the neighbor guard |
| `a4edf1e` | NpfdiS | Widgets, gamepad and MIDI |
| `7c3b501` | | Two stale Ref id notes |
| `c94c419` | 4C6OnU YwzxDx SO79nL GLwTk5 tqkXpr ugepWX | reviewer-76's compose, page and define fixes |
| `a44181b` | R2fusd | The editor stage, write-back, Grips, zoom and pan, element events |
| `15bed68` | P3fj7k AxQH2A qJexR0 | reviewer-76's kit/run fixes, and a same-key rebuild keeps its record |
| `cb1d699` | yJU9zy | The host's workaround gone; page.writeProblem, page.fromStage; main.js split |
| `9d3463c` | nx8YZ0 | A stepped value stays inside its bounds |
| `2097ff1` | | PAGE by its constant in grip-desk.js |
| `fc25199` | vXxknp qgtpNs wZAGIk ko3E1R APskkG | reviewer-79's host fixes; run.inputNow |
| `a5a41d8` | 7HuCx4 svaHXA | Every preview and commit through inputNow; a failed restore said once; a pad without a timestamp |
| `599bf88` | jLEeBY | The driver keeps its frame cadence across inputNow previews (run.jumps); AGENTS.md's fast-suite figure is 15 s |

## Review

Every commit through `a5a41d8` was reviewed (reviewer-afe-72, -76, -79, -80, -82, -84), and every confirmed finding is fixed or filed. **Not reviewed: `599bf88`** (drift-85, about 30 lines in kit/run/driver.js and scheduler.js, `run.jumps`); review it first next session. Each fix round this session turned up a new regression in the round before, all around the host's input stamping, so the review should try a live driver run with previews, a rewind and a seek together.

## Prerelease

`npm run test:prerelease` at `fc25199`: 19 tests, 19 pass, 40 s. The planted faults are unchanged: JS 24/26 and GLSL 21/24, with the same five escapes. `a5a41d8` and `599bf88` came after it; drift-85 ran `kit/run/prerelease/driver-cost.prerelease.js` on its change, which passed. The fast suite is 3,386 tests in about 16 s (3,275 at the session's start).

## Open

- `9gOw7t` (low): a same-key rebuild of a stopped demand part makes an empty instant.
- `A1eqGG` (low): the writeBack API writes a non-finite value, and its `step` option ignores bounds.
- **wb-param and params-panel previews are not coalesced per frame** (one input per event). Coalescing would reverse the "in force at once" ruling's test, and the params panel has no preview/commit split; a leaf only if the log size matters.
- **Known limits** (host README): a param preview while paused redraws at the part's next step; main.js does not lay its panels out by `layoutOf`; the pick's `map` scatter and a points `curve` look are not built; on a trackpad a two-finger drag is a wheel and goes to the part.

## Next

1. **Ben's hand check of the page** (above).
2. **A blind dogfood of the page** with a non-game leg (a synth with MIDI knobs, the lens bench with Grips), as the controls draft's stage plan asks. A leg cannot see a browser either, so decide first what a leg can check: the DOM-free session and editor modules, or a headless browser if one is added (a dependency; ask Ben).
3. `layoutOf` in main.js, and the two lows.
4. From the backlog when a sketch is scheduled: CPU tier stage 1 (Knuth–Plass) and its dogfood; the six browser probes; the GPU image pipeline, the audio runner, and live arguments through a rebuild.
