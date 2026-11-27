# Plan: a built-in layer part, and package tests

*2026-11-27. Ben accepted both proposals today ("I accept the proposals"), closing the two decisions the M4 trial raised: `qynNme` (layering) and `z3dUoJ` (testing a package's Event input alone). Evidence: [the M4 trial findings](2026-11-26-m4-trial-findings.md), "Composition: two known gaps" and "Testing a package alone". The `tasks:` block below was imported on 2026-11-27 as container `XlXLSp`; the tracker is the plan from then on.*

## Why

The M4 trial showed that the composition pattern works: two packages written blind were composed by a third session with no massage. It also found the two gaps that cost the most:

- **Layering needs a whole package.** Drawing a HUD over a game took a 70-line root package (`overlay`: Dialect, Grammar, runtime, UI, example) whose builder is `[...layer.under, ...layer.over]`. Its Draw inputs copied the producers' ceilings by hand (`Draw<302>`, `Draw<8>`), so a bigger picture from another package would be S204. Its canvas extent repeated the level's pixel size by hand.
- **No author could test an Event input.** All three authors stubbed `defineRuntime` and drove `step` in plain Node, outside the kit. kit/run can already script inputs, but a package may not import it, and nothing gives an author a one-part harness.

## Rulings (Ben, 2026-11-27)

1. **Layering is a built-in part, like `page`.** A part, not only a several-output `.show`, so a layered picture can be wired, shown or layered again. The kit knows the producers wired into it, so it derives what the composer copied by hand. Its output's max is the sum of the producers' built maxes (kit/define's `seams.draws`), and its inputs take their ceilings from the producers. Its frame comes from the bottom layer, so no extent is typed twice. `.show(a.out.view, b.out.view)` is shorthand that adds one.
2. **Package tests are one declarative entry in the manifest.** Faking an Event and scripting inputs are one mechanism: a script is a list of timed records on named inputs. What authors lacked is access (a package may not import kit/run) and a place to declare expectations. A manifest `tests` entry names an example, gives timed inputs and says what to expect. The kit runs it, so a package imports no test code. The same form can later cover value inputs and param edits.

## Order

The two stages touch different modules (kit/compose and kit/run for layering; kit/package, kit/run and the checkers for tests) and can run in parallel. Each follows the local dogfood ruling (AGENTS.md, "Dogfood our own designs before locking them in"):

1. Draft the API as docs, with placeholder snippets, not examples.
2. Have fresh blind agents use the draft.
3. Revise the draft.
4. Build it.
5. Close the stage with a rerun of the matching M4 trial leg on the real kit.

## What stays open, by stage

**Layer.** How a glue makes one (a `layer(<name>)` builder, or only through `.show`, or both). How its inputs are named and ordered (painter's order by argument position, or named ports). What happens when the layers' frames differ: convert each to the bottom layer's frame through the existing frame graph, which is the expected answer. How S401 (profile kinds) follows through it. Whether kit/run steps it (it should not: like `page`, its output each frame is the concatenation of its inputs, already converted).

**Tests.** How a record reaches an Event input that nothing is wired to: a new kit/run input kind addressed to `<part>.in.<input>`, or a built-in script source part like `page`. Which expectations exist: state values at an instant, output Event counts or records, a run diagnostic expected. Who runs them: a `checkTests` beside kit/package's `checkExamples`, or kit/page (kit/package may not depend on kit/run). How the page shows a failing test.

```yaml
tasks:
  - title: "Composition polish: a built-in layer part and package tests"
    desc: |
      From the M4 trial's two biggest gaps, both accepted by Ben on 2026-11-27. Plan: project/2026-11-27-layer-and-package-tests-plan.md. Evidence: project/2026-11-26-m4-trial-findings.md. Two independent stages, layering and package tests; each runs draft, dogfood, build, then a closing trial.
    children:
      - title: "Layer: draft the built-in layer part's API"
        ref: layer-draft
        desc: |
          Why: drawing one picture over another needs a hand-written root package today (the M4 trial's 70-line overlay, scripts/m4-trial/runs/2026-11-26/compose/overlay/), with Draw input ceilings and the canvas extent copied by hand from the producers. Ben ruled (2026-11-27, plan doc "Rulings" 1) that layering is a built-in part like kit/compose's page part. Its output max is the sum of the wired producers' built maxes. Its inputs take their ceilings from the producers. Its frame comes from the bottom layer. `.show(a.out.view, b.out.view)` is shorthand that adds one.

          What: a draft, as documentation an agent can build against: a new section of kit/compose/README.md marked draft, plus the lines kit/START.md and kit/API.md would gain, written with placeholder snippets (<part>, <output>), never made-up names. It settles the open questions in the plan doc's "What stays open: Layer": how a glue makes one, input naming and order, differing frames (expected: each converted to the bottom layer's frame through the existing frame graph), S401 through it, and that kit/run does not step it. It names the new S codes. It shows how the M4 trial's glue would read without overlay.

          Seams: kit/compose (page.js is the model for a built-in part; draw.js for Draw wires and S401; seams.draws from kit/define for built maxes), kit/run (how a page part is skipped when stepping; Draw conversion via kit/draw convertOp), kit/seam (Draw<max>@frame).

          Out of scope: building it (layer-build); count budgets (the profile's job at draw time).

          Open: anything that changes the ruling above goes to Ben; the rest is the drafter's call, written down with its reason.
        criteria:
          - The draft section exists in kit/compose/README.md marked draft, answers every open question in the plan doc's Layer list, and names its S codes.
          - The M4 trial's glue rewritten against the draft has no overlay package and no hand-copied ceiling or extent, shown in the draft.
      - title: "Layer: dogfood the draft with blind agents"
        ref: layer-dogfood
        blockedBy: [layer-draft]
        desc: |
          Why: the local dogfood ruling (AGENTS.md) says fresh agents use a design before it is frozen; their difficulty is feedback on the design.

          What: two or three blind Sonnet runs (claude -p from a folder under /private/tmp, as scripts/m4-trial does; see project/gotchas.md on blind legs and reading long docs by offset) each get the M4 trial's gemgrid and scoretimer packages, the kit docs with the draft, and the compose task (scripts/m4-trial/task-compose.md) adapted to say layering is built in. They write a glue against the draft. Since it is not built, check what can be checked by program (the draft's rules as a checker script, or a reading by the integrator), and review each hand-in by hand. Record difficulty, what misled them and what they guessed, then revise the draft. The size of any massage is a finding.

          Out of scope: building the part.
        criteria:
          - A dated findings doc in project/ records each run (turns, cost, difficulty, what misled) and the draft changes it caused, with the command that reproduces the runs.
      - title: "Layer: build the built-in layer part"
        ref: layer-build
        blockedBy: [layer-dogfood]
        desc: |
          Why and what: build the layer part as the revised draft (kit/compose/README.md, draft section) says, so a glue layers Draw outputs with no root package. Ruling: plan doc "Rulings" 1.

          Seams: kit/compose (a built-in part beside page.js; S checks; S401 kinds followed through it; the composed record), kit/run (not stepped; its output each frame is its inputs' converted lists concatenated in order), kit/page (the shown view can be a layer), kit/START.md and kit/API.md (drop "Not built: a composed page that layers parts"). Remove the draft marking.

          Fail closed: a layer whose inputs come from no producer, or a shown kind the profile cannot draw, must be refused, never drawn empty or silently.
        criteria:
          - Tests in kit/compose and kit/run show a two-layer composition draws the bottom layer's ops then the top's, in the bottom layer's frame, with max the sum of the producers' built maxes.
          - A layered output can be shown, wired to another layer, and checked against a profile (S401), each with a test.
          - The docs describe what the code does, with no draft marking left.
      - title: "Layer: rerun the M4 compose leg with the built-in layer"
        blockedBy: [layer-build]
        desc: |
          Why: the stage's definition of done. The M4 trial's composer spent its only real work on layering (project/2026-11-26-m4-trial-findings.md).

          What: rerun the compose leg of scripts/m4-trial (one blind Sonnet run, the same two packages, the task saying layering is built in) on the real kit, through the page's loader as the checker does. Compare its glue size, turns and rating with the 2026-11-26 run, and add to the findings doc from layer-dogfood or write a new dated one.
        criteria:
          - The hand-in passes the checker and plays on the workbench page with no overlay package. The record of the run is in scripts/m4-trial/runs/ and the comparison is in a dated findings doc.
      - title: "Tests: draft the manifest tests entry"
        ref: tests-draft
        desc: |
          Why: every M4 author tested its Event input outside the kit, by stubbing defineRuntime and driving step in Node (project/2026-11-26-m4-trial-findings.md, "Testing a package alone"). Ben ruled (2026-11-27, plan doc "Rulings" 2) that tests are one declarative manifest entry: an example, timed inputs on named inputs, and expectations, run by the kit, so a package imports no test code.

          What: a draft in the package format docs (kit/package/README.md's manifest table, marked draft, and the lines kit/START.md and kit/API.md would gain), with placeholder snippets. It settles the open questions in the plan doc's "What stays open: Tests": how a record reaches an unwired Event input (a kit/run input kind addressed to an input, or a built-in script source part like page), which expectations exist (state at an instant, output Event records or counts, an expected run diagnostic), who runs the tests (kit/package may not depend on kit/run, so a runner beside kit/page's presets or a new module), how a failure is reported (codes), and how the page and the trial checkers show results. It shows the tests the M4 game and score authors asked for, written in the draft's form.

          Seams: kit/package (manifest.js, checkExamples as the model), kit/run (input kinds, page inputs as the model for injected records, stats and diagnostics), kit/page (presets, sweeps), scripts/m4-trial/check.sh's checker.

          Open: anything that changes the ruling goes to Ben; the rest is the drafter's call, written down with its reason.
        criteria:
          - The draft exists in kit/package/README.md marked draft, answers every open question in the plan doc's Tests list, and names its codes.
          - The draft shows the M4 game's pad test and the score's end-of-round test in its own form.
      - title: "Tests: dogfood the draft with blind agents"
        ref: tests-dogfood
        blockedBy: [tests-draft]
        desc: |
          Why: the local dogfood ruling (AGENTS.md).

          What: two or three blind Sonnet runs, each given the kit docs with the draft and a package task (scripts/m4-trial/task-game.md or task-score.md, adapted to ask for tests of each Event input), write a package with a tests entry. Check what can be checked by program and review by hand. Record difficulty, what misled and what was guessed; revise the draft. See project/gotchas.md on blind legs.
        criteria:
          - A dated findings doc in project/ records each run and the draft changes it caused, with the command that reproduces them.
      - title: "Tests: build the manifest tests entry and its runner"
        ref: tests-build
        blockedBy: [tests-dogfood]
        desc: |
          Why and what: build package tests as the revised draft says. Ruling: plan doc "Rulings" 2.

          Seams: kit/package (manifest validation of tests, K codes), kit/run (whatever injection the draft chose), the runner the draft chose, kit/page/host (show results), scripts/pkg-trial and scripts/m4-trial checkers (run the tests). Remove the draft marking.

          Fail closed: a test that names an input, output, example or state path the package lacks is refused, never skipped; a test run is deterministic (same log, same result) and replays as kit/run does.
        criteria:
          - Tests show a package whose tests pass is clean, a failing expectation names the test, instant and expected vs actual, and a test naming a missing input or output is refused.
          - The page or the checker runs a package's tests and shows the result, shown by a test or a screenshot.
          - The docs describe what the code does, with no draft marking left.
      - title: "Tests: rerun a package leg with tests required"
        blockedBy: [tests-build]
        desc: |
          Why: the stage's definition of done.

          What: rerun the score leg (or the game leg) of scripts/m4-trial on the real kit, one blind Sonnet run, its task requiring a test of each Event input. Record whether the author still writes a harness outside the kit, and compare turns and rating with 2026-11-26.
        criteria:
          - The hand-in's tests run in the checker and pass, the author wrote no test harness outside the kit, and the run is recorded in scripts/m4-trial/runs/ with a dated findings doc.
```
