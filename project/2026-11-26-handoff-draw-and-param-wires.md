# Handoff: Draw built and lowered, param wires, the why text, the runtime relay

*2026-11-26, end of session 4. Picks up after [the runtime-contract handoff](2026-11-26-handoff-runtime-contract-built.md) (`853d56d`). This session's commits are `ada0afe..` HEAD. Ben was around for the first half and ruled on every open question. He then left with "don't stop for me unless you hit a real blocker"; the calls the integrator made after that are listed below.*

## Needs Ben's eyes

1. **Calls the integrator made while Ben was away.** Each can be reversed; say so and it gets a leaf.
   - **Draw ruling 2:** op kinds are checked at composition, counts at draw time. Ben had confirmed only that the composer owns the budget. Ruling 3, tiles scale their cell size, was left to the integrator. Both are in [the draw-list draft](2026-11-26-draw-list-draft.md), final rulings block.
   - **Page inputs coalesce** to the latest value per control until the consumer takes it (`ada0afe`). A tap that presses and releases between two steps of a slow part is lost. Say if taps should queue instead.
   - **A param wire's input is stamped with the instant that made it**, and applied right after that instant (`553040a`). Stamping at the next instant, or at that instant plus 1 ms, is unsound: frames logged later move the stamp, and two instants can share a millisecond.
   - **The param-wire ruling has a marked correction** in [the seams draft](2026-11-25-seams-draft.md): bounds are checked at run time (N008), and the loop rule (S117) is narrow. Read literally, the rule would have refused the double descent's own fix.
   - **Game Boy:** text counts as sprites. A second tiles layer must be exactly the window. A mirrored image uses the flip bit.
   - **A builder can't see its Dialect file's own consts and helpers.** They go in `library`, as for any Runtime Lambda. That cost the massaged trial legs 5 lines.
2. **Runtimes read param values through `ctx.params`, never from the record** (kit/define README). This keeps param values out of the key (`x3iG6D`). No runtime in the repo broke the rule.

## What landed

| Commit | Leaf | What |
|---|---|---|
| `ada0afe` | `BBsT93` | Review fixes for 5e0813e: `$T` copies before stamping, the page bound, a part named page, N007 |
| `7fe3262` | `UTdvE6` | The runtime relay on bounce into swarm, six legs clean with no massage ([findings](2026-11-26-runtime-relay-findings.md)) |
| `950a948` | `QNMCGy`, `CUFPqJ` | S206 suggests only a rename that plans. The `types` key and a `data()` record's shape documented |
| `272e05f` | `HKNInI` | The why-text trial: 12 of 12 blind legs fixed the double descent ([findings](2026-11-26-why-text-trial-findings.md)) |
| `953e969`, `b9fe5df` | `9GMTBs`, `F2FuPu` | The why text in kit/build and `run.why()`, plus its review fixes |
| `f36784b`, `46da1f9` | `8JTaDq`, `x3iG6D`, `pSo5YA` | Rulings recorded: a wire constant, no Program data on ports, a param wire, param values out of the key, and the draw list |
| `5db1d27`, `553040a` | `KVDbRv`, `YV7ZNG`, `DJZ2z2` | Param values out of the key, `{ set }`, `.wire(… .param.<name>)`, and their review fixes |
| `3b26012`, `81657d6`, `a2dfa1d` | `GCy994`, `uxHxOZ`, `vcIzt1`, `WNeULS`, `yHrDWK` | Draw: the seam, builders lowered as Bench code, conversion, Canvas and the Game Boy profile, rewind, and two rounds of review fixes |

## Review

- **Reviewed and fixed:** 5e0813e, 950a948, 953e969, 5db1d27 and 3b26012. Probes are in `local/rev-5e0813e`, `rev-why-10`, `rev-pw-12` and `rev-draw-13`. The `rev-draw-13` probes call `runDraw` with the old `globals` argument, so they no longer run as written.
- **In review at handoff:** `81657d6` and `a2dfa1d`, by reviewer-draw-16, which was still running when this was written. Its findings land below if it reported in time. If not, review that range first.

## Prerelease

`npm run test:prerelease` at `a2dfa1d`: 19 tests, 19 pass, 37 s. Planted faults: JS 24/26 and GLSL 21/24, the same five escapes as before. The fast suite is about 2,760 tests in about 10 s.

## Gotchas this session

- A squash merge of two parallel agents, each correct alone, broke two tests. The renderer fixes wrote builders as plain JS, and the other branch made builders Bench code. When one branch tightens a contract, grep the other branch's new tests for the pattern it now refuses before you squash (the same lesson as the last handoff's).

## Next

0. **Reviewer-draw-16's findings**, if any (see Review).
1. **`hca0YM`: the page draws the shown Draw list.** This covers the defineUI stage form, image sources, `drawCanvas` in the workbench page, and reporting the draw-time check. kit/compose's record should also keep the `profile` given to `check()`, so `pageView` callers don't pass it again.
2. **`IhJ35P`: a workbench composed from two Dialects written in separate sessions**, once `hca0YM` lands. This closes M4.
3. Small items, not filed:
   - A Dialect whose params global isn't named `$` loses `$` in builders. No Dialect in the repo does this.
   - An origin on `param` and `rebuild` inputs, parked in kit/build's README.
   - A Game Boy pixel renderer.
