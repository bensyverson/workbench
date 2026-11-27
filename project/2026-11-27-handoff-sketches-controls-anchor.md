# Handoff: the founding-example overfit, the sketch feasibility study, and the anchor built

*2026-11-27, end of session 7. Picks up after [the layer and package tests handoff](2026-11-27-handoff-layers-and-package-tests.md) (`81ec3d3`). This session's commits are `7323df7..` HEAD. Ben was around for the whole session and ruled as it went; every ruling is in the doc it rules on, listed below.*

## Needs Ben's eyes

Nothing is waiting on Ben. Every question this session raised was ruled. The next step needing him is the controls build's possible stop: if kit/define gives no Ref id to a literal-only builder call, `record.js` must change, and the build agent stops for him (controls draft, question 16).

## What happened

1. **The page's controls overfit the DMG pad.** Ben asked whether button wiring (`Lu11Q1`) overfits buttons. Tracing it showed how. The M4 UI ruling said a package declares its controls. The `rc-wire` brief turned that into "what the page part offers (at least the D-pad and buttons the DMG host has)", and the agent built `PAGE_CONTROLS`, which sits beside defineUI's declared inputs. See [the overfit finding](2026-11-27-founding-example-overfit.md). New local ruling in `AGENTS.md`, **"Serve more than the founding examples"**: every kit contract names a workbench beyond DMG, fields and data; reviews check against it; each design stage's dogfood includes a non-game leg; and a brief never states a founding example's set as a floor.
2. **Ben's eight sketches were checked for feasibility** (spectral path tracer, lens bench, virtual camera, FM synth, sequencer, Grotesk, Book, language playground; [sketches](2026-11-27-workbench-sketches.md)). Four Opus agents covered them, with no new dependencies. See [the findings](2026-11-27-sketch-feasibility-findings.md):
   - Nothing is impossible as a whole, and about 20 narrow items are impossible or unwise, each with its reason.
   - There are seven gaps, led by interaction, which all eight sketches need. Source write-back, ruled in M4, was never built.
   - The probes are in `scripts/feasibility/`, and each gap is in `project/backlog.md` with what would un-park it.
3. **Three designs were drafted, and two of them dogfooded:**
   - [Declared Controls](2026-11-27-controls-draft.md): all 13 interaction requirements as one stage. Two dogfood rounds with blind paper legs, game, synth and lens: [findings](2026-11-27-controls-dogfood-findings.md), `scripts/controls-dogfood/`. Ready to build.
   - [The CPU tier](2026-11-27-cpu-tier-draft.md): one language, two tiers, with five inferred "needs". QuickJS was rejected. Stage 0 is built.
   - The anchored `.frame` edge: dogfooded with four legs ([findings](2026-11-27-anchor-dogfood-findings.md)), and **built**.

## Rulings this session (each recorded where it rules)

- **Overfit and process:** the overfit finding plus the `AGENTS.md` local ruling.
- **No new dependencies; browser standards are not dependencies:** the findings head and the `tXS4wB` note.
- **Sketch findings, "Rulings":**
  1. Image and audio are output derived beside run state.
  2. A CPU tier, rather than trusted runtime JS forever (runtime JS is the interim). Asked whether TS, Typed, Zig or Rust could help: the memory model is the limit, not the source language.
  3. The controls redesign is one stage, built by one agent: all tests first, red as a batch, implement, then check.
- **Controls draft, "Rulings":**
  - Questions 1–12 and 13–18: the integrator's recommendations, all accepted.
  - The latency class is **`"direct"`**, not `"audio"` (Ben noticed nothing in it is audio-specific; `realtime` collides with kit/run's real-time driver).
  - H009 retires, and the misfit becomes U016.
  - Data files reach runtimes as `ctx.files` in this stage.
- **CPU tier draft, "Rulings":**
  - The language stays Bench, with tiers `bench` and `cpu`.
  - Closures, `map` and `filter` stay out.
  - wasm comes after stage 4.
  - Stage 0 was scheduled now.
- **Anchor (kit/compose/README.md):**
  - The re-plan on rebuild is adopted.
  - A layer's page box grows to the union of its inputs' placed boxes.

## What landed

| Commit | Leaf | What |
|---|---|---|
| `99c47e5` | `WAzKpM` | Layer review lows: kit/run refuses hand-edited layer records (N007), H010 for a sizeless shown layer, layers matched by their field |
| `56f45b7` | `ow3c4e` | Package-tests review fixes: an events window past the end, an undeclared state path (H008), union paths, the stamp bound, L003 wording; API.md drops `ctx.controls` |
| `8996823` | | kit/run refuses a run time that is not a time. `runUntil(null)` looped until out of memory, reached via `56f45b7`; the integrator found it rerunning the probes |
| `7323df7`, `cfe1be1`, `702797f` | `1ymuQu`, `tXS4wB` | The overfit finding and local ruling; the feasibility findings, backlog entries and `scripts/feasibility/`; the rulings |
| `32ce73e`, `5f57745` | `JBkhsf`, `wCDTzk` | The anchor draft, and its dogfood (pair form `{ from, to }`) |
| `d3de7e3` | `Gqg0Sf` | The CPU tier draft |
| `03c3c5e`, `e827b97` | `sSgaWG`, `822dDs` | The controls draft, and its dogfood (two rounds, all six hand-ins compliant in round 2) |
| `ce1e7b4` | `o2RhFb` | **CPU tier stage 0:** `xs.length` in every Dialect (typed as the Dialect's number type), `??`, loop-index narrowing (a checked read keeps its old type, so no program breaks), `needs: []` on every Kernel (V013) |
| `d8daa26` | `QqirvU`, `Wd9nH5` | **The anchored edge built**, plus the re-plan on rebuild (`kit/compose/replan.js`, `kit/run/replan.js`, `run.composed`), which fixes stale "fit" and Dialect edges and the page box; the layer page box grows |

## Review

- **Reviewed this session:** `0639eb3` (reviewer-tests-43). Its findings are fixed in `56f45b7` and verified against its probes, which uncovered `8996823`. Also `665c1ca`, `770e210` and `c2f8b64`, with nothing serious.
- **Not reviewed; review first next session:**
  - `d8daa26`: the anchor build and kit/run's re-plan. It is a runtime contract, about 900 lines with tests. It changes rebuild semantics, checkpoints and the page box.
  - `ce1e7b4`: it touches the IR verifier (fail-closed) and lowering for every Dialect. **Probe this case:** an f32 Dialect's UI lambda reading `s.<open list>.length`. UI lowering gives an open list a max of `OPEN_MAX`, which is above 2^24, and the verifier now refuses an f32 length past 2^24, so that read may fail (V-error, kernel null).
  - Also small and unreviewed: `99c47e5`, `56f45b7` and `8996823`.

## Prerelease

`npm run test:prerelease` at `d8daa26`: 19 tests, 19 pass, 38 s. Planted faults: JS 24/26 and GLSL 21/24, with the same five escapes as before. The fast suite is 3,148 tests.

## Next

0. **Review `d8daa26` and `ce1e7b4`** (one fresh reviewer each), then `99c47e5`, `56f45b7` and `8996823`.
1. **The controls build (`FhnOhO`).** One agent, per ruling 3 and the draft's build plan: 54 test groups plus 49a–49c, written first and run red as a batch, then the implementation, then the check. Opus, since it carries runtime contracts and write-back. It closes `Lu11Q1` and the UI-button crash reviewer-tests-43 found (`local/rev-tests-43/ui-control.probe.js`). It also delivers `ctx.files` and a `vec3` color in Draw. Massage the trial runs that tests load (UIs with `inputs`, glues with `page.out.pad`), and record the massage.
2. **`aWrZQr`**, the tests stage's closing trial: one Sonnet and one Haiku author leg, plus (new rule) a non-game leg.
3. **Open issues:**
   - `EggIAM`: the host canvas does not resize when a rebuild changes the page box.
   - `daTVc3`: kit/run binds params as `$` whatever the Dialect's `params.name`.
4. **Later, from the backlog, when a sketch is scheduled:**
   - CPU tier stage 1, with Knuth–Plass as its test, then its dogfood;
   - the six browser probes listed in the findings (AudioWorklet, MIDI, WebGPU in Chromium, binary save, fetch, FontFace);
   - the GPU image pipeline, the audio runner and Draw's vocabulary.
