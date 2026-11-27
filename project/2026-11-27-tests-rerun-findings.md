# Tests rerun findings: blind authors test on the real kit with no harness, and a demand clock that never steps

*2026-11-27, leaf `aWrZQr` (container `XlXLSp`, the package-tests stage's closing trial), by trial-65. Three blind `claude -p` author legs on the real kit at `028aa4c` (declared Controls, tests run by kit/page's `runTests`): game on Sonnet 5.5, game on Haiku 5.5, and score on Sonnet 5.5. The score leg is the non-game leg the local ruling "Serve more than the founding examples" asks for. Records: [scripts/m4-trial/runs/2026-11-27-tests-rerun/](../scripts/m4-trial/runs/2026-11-27-tests-rerun/). Setup: [scripts/m4-trial/README.md](../scripts/m4-trial/README.md), "Running the trial". Compared with [the M4 trial](2026-11-26-m4-trial-findings.md) and [the tests dogfood](2026-11-27-tests-dogfood-findings.md).*

## Summary

- **The stage's criterion passes.** Every hand-in's tests ran in the checker and passed: 3 of 3, 5 of 5 and 3 of 3. No leg wrote a test harness outside the manifest. The massage was **0 lines**: each hand-in checks clean as it was handed in.
- **The tests mean something.** Eight of nine one-line runtime mutants were caught by the author's own tests. The one that survived is equivalent for any input a test can send.
- **Both game legs hit one kit flaw: a `demand` clock never steps a part that runs alone, and nothing says so.** Each game author first wrote `clock: { demand: true }`, which the docs say steps "when a record is ready". Every move test failed with the player still on its start cell (11 H006s and a T010 each), with no diagnostic saying why. Each switched to a tick, with no account of why that worked. This is the costliest finding (below, recommendation 1).
- **Neither game leg could read how to declare a Control.** kit/API.md says each kind's keys and record are in define/README.md and in the controls draft. define/README.md lists only the kind names, and the draft is not in a leg's docs. Both declared a `buttons` Control by guessing from the text of U017. Sonnet also found the D-pad's seam quoted in a stale paragraph of package/README.md. Haiku declared no keys, so its game is played on screen only (recommendations 2 and 3).
- **Turns and rating.** The score leg matched the tests dogfood: 17 turns, rated 1. The Sonnet game leg took 27 turns and rated the task 2, the same as M4's run 1 (27) and more than the tests dogfood's game (21). The Haiku game took 42 turns and rated it 3. The extra turns went to the demand clock and the Control form, not to the tests.
- **Before the legs, the task docs and the checker were brought up to declared Controls.** The game task no longer gives the pad's seam. The checker now plays whatever Controls a package declares (below).

## Before the legs: the task and the checker

Commit `787000e` retired the page's built-in pad. The trial still asked for it.

- **`docs/task-game.md`** said "The page offers its D-pad as a built-in part … your package accepts it as an Event input with exactly the pad's seam". Its check.sh paragraph said the checker plays "with the page's pad wired to your pad input … right held for a second, then down".
  - The task now says the page has no controls of its own: the package says how a person steers the player (by keys, by on-screen controls, or both), and it points to kit/API.md's "defineUI" and compose's "The page". It gives no seam, no declaration and no Control kind.
  - The check paragraph now says the checker wires what the UI declares and plays each thing a person can press or change, for about a second each.
- **`tests-dogfood/task-tests-game.md`** said "every Event input … (the pad, at least)". That stated a founding example's set as a floor. It now reads "every Event input your Dialect declares", and for the input that steers the player it asks the test to show the player moves and does not walk into a wall.
- **`task-score.md` and `rules.md`** name no founding set; they are unchanged.
- **The checker** (`checker/legs.js`) had two problems:
  - It took only an input with the D-pad's seam (T006).
  - It held ArrowRight, then ArrowDown. So a game that declared its own buttons, or no keys, failed T006 or T010 even though it played.
  - Now T006 is "the UI declares no Control on an Event input". Each such Control is wired from `page.out.<name>`, the way the page wires a part played alone.
  - `playControls` plays a buttons Control on screen: each button is held alone for a second, which is the record the page host's on-screen form sends. Any other kind is played through each key code it declares, a second each.
  - Two red-first tests are in `scripts/m4-trial/test/check.test.js`. One is run 1's game with its input and buttons renamed and its keys dropped: it was T006 and T010, and now checks clean. The other is the same game with no Control: it was clean, and is now T006.
- **During the run, a checker message misled two legs.** `tests-dogfood/check.js` printed T030, "the manifest has no tests", beside a K011 or K014, while the manifest listed tests that had never run. T030 now fires only when the manifest lists no tests. Its red-first test is in `tests-dogfood/test/tests-dogfood.test.js`.
- **Not changed:** the compose and layer legs' pad script, `PAD_SCRIPT`, still holds arrow keys. Every recorded game declares them, and this brief ran no compose leg. A compose leg on a game with other keys would need the same change.

## The legs

`node scripts/seams-trial/summary.js /private/tmp/aWrZQr-game-sonnet /private/tmp/aWrZQr-game-haiku /private/tmp/aWrZQr-score-sonnet --skip-last`. Each recorded log ends with the integrator's recheck (`./check.sh <package>` in the leg's folder, clean for all three), hence `--skip-last`.

| Leg | Package | Checks | Codes; first clean | Turns | Time | Cost | Rating | Tests (checker) | Harness | Massage |
|---|---|---|---|---|---|---|---|---|---|---|
| game, Sonnet | `cavern` | 5 | H006 ×11, T010 (the demand clock), then K014, T030 (a refusal broken on purpose); clean at run 2 | 27 | 127 s | $0.72 | 2 | 3 of 3 pass | none | 0 lines |
| game, Haiku | `gridgame` | 5 | K011 + T030 ×2 (D012 `spaces`, U017 `buttons`), H006 ×11, T010 (the demand clock); clean at run 4 | 42 | 232 s | $0.39 | 3 | 5 of 5 pass | none | 0 lines |
| score, Sonnet | `roundkeeper` | 2 | none; clean at run 1 | 17 | 94 s | $0.49 | 1 | 3 of 3 pass | none | 0 lines |

$1.60 in all.

**Harness.** `node scripts/m4-trial/tests-dogfood/scan.js <leg dir>` lists every Bash and Write call of a leg. No leg wrote a script that imports its runtime, stubs `defineRuntime`, calls `step` or drives kit/run. The score leg used one `python3 -I` edit of its manifest's JSON, which is a text edit, not a harness. The Sonnet game leg copied its own manifest to `/tmp` and back around a deliberate wrong-code check, and disclosed this as a breach of its folder. It also once `cat`ed doc excerpts long enough to be saved under `~/.claude`, but it did not open the saved file (the transcript has no tool call naming it).

### How they declared their Controls, and what they guessed there

Neither game leg could read a declaration. kit/API.md's defineUI block gives `controls: { <input>: { kind: "<kind>", label: "<label>", <the kind's keys> } }`. Its "Controls" paragraph says each kind's keys and record are "in define/README.md and the controls draft". Two things are missing from a leg's docs:

- define/README.md names the kinds (`CONTROL_KINDS`) but gives no kind's keys or record.
- `project/2026-11-27-controls-draft.md` is not among the docs `run-tests-dogfood.sh` copies (nor `run.sh`), so the link has nowhere to go.

Both legs reported it under "Docs I could not reach" and as their top gap.

- **Sonnet (`cavern`)** declared `move: { kind: "buttons", label, buttons: ["up", "down", "left", "right"], keys: { up: ["ArrowUp", "KeyW"], … } }`, with no `grid`. It took the list shape from U017's text in `define/codes.js` ("buttons that are not identifiers or repeat"). It took `keys` and the record's shape from package/README.md's "Rulings", which still quotes `Event<{ up: bool, down: bool, left: bool, right: bool }>` "for the pad". That paragraph is stale since declared Controls, and it hands an author the founding example's seam. It left out `grid` because no doc it could read gives its shape.
- **Haiku (`gridgame`)** declared `steer: { kind: "buttons", label, buttons: ["up", "down", "left", "right"] }`, with **no keys**, because no doc it could read gives the `keys` shape. Its game can be played only on screen. Its first try had no `buttons` key at all (U017: "add buttons: …"), and that fix message gave it no shape.
- **Score (`roundkeeper`)** declared no Control. It wanted a button to score by hand and left it out rather than guess. So, played alone, its round only counts down.

Both game legs chose the four directions as bool buttons: the founding pad again. One leg cited the stale seam; the other has no stated source beyond U017.

### The demand clock (both game legs)

Both game runtimes first said `clock: () => ({ demand: true })`. A game steps only when steered, so it is the natural clock, and the docs promise it works:

- kit/package/README.md, "Tests": a demand part's first step is "when a record is ready".
- kit/run/README.md: "A demand part steps at the first instant, after a rebuild, when an Event is ready for it."

In fact, a part run alone with a demand clock never steps after T = 0. Neither a test's `in` records nor the page's Control records make an instant. "Demand parts make no instants of their own", and kit/run's "Not here" lists "a workbench of demand parts only (nothing makes an instant)". So every test failed with the init state (H006 ×11), and the play changed nothing (T010). No diagnostic named the cause.

Reproduced by hand: copy `cavern/` and change only its clock to `{ demand: true }`, then `node scripts/pkg/hash.js <copy>` and `node scripts/m4-trial/tests-dogfood/check.js --role game <copy>`. It gives the leg's first-run H006s. Each leg switched to a tick (1/60 s and 1/10 s), and neither knew why that worked.

### What the tests cover (read by hand)

- **`cavern`** (3 tests):
  - one press moves one cell, and holding does not repeat;
  - walls stop the player, and a later move must succeed, so ignoring input cannot pass;
  - the `picked` records: none before the gem, exactly one with its value at the gem, and none on walking back over the cell. The tests also expect the `player`, `collected` and `remaining` outputs.
- **`gridgame`** (5 tests): a move right; a held direction does not repeat; a wall stops the player; a gem is picked up (state, the `picked` output and the `pickup` records); walking back over a taken gem picks up nothing.
  - **A latent bug no check finds:** `events.out.pickup` is 1, while one step can take up to 48 `steer` records. Two presses that each reach a gem within one 0.1 s step would push two records.
- **`roundkeeper`** (3 tests): one record, then two at one stamp, through every value output and the shown strings; records at 9.9, 9.999, 10 and 11 s of a 10 s round, of which the first two count, with the score held to 15 s; and the defaults.

### Mutants

`node scripts/m4-trial/tests-dogfood/mutate.js <package> <runtime file> '<old>' '<new>'`, on each leg's folder as handed in:

| Package | Mutant (one line) | Result |
|---|---|---|
| cavern | the wall check removed | killed: 2 of 3 pass |
| cavern | `events.picked.push(…)` removed | killed: 2 of 3 pass |
| cavern | the `held = …` update removed (every record moves) | killed: 2 of 3 pass |
| gridgame | `target.wall` dropped from the blocked test | killed: 4 of 5 pass |
| gridgame | `events.pickup.push(…)` removed | killed: 4 of 5 pass |
| gridgame | `&& !s.held[d]` dropped (holding repeats) | killed: 4 of 5 pass |
| roundkeeper | the end-of-round `$T` filter removed | killed: 2 of 3 pass |
| roundkeeper | `score += worth` → `score += 1` | killed: 1 of 3 pass |
| roundkeeper | `if (!state.over)` → `if (true)` | survived: equivalent for every record a test can send, since the `$T` filter already refuses them; it differs only for a record stamped before the end and delivered after it, which needs a delayed wire |

### What else misled them, and what they asked for

- **KIT_VERSION** (Haiku): kit/define/README.md says `KIT_VERSION` is `"0.4"`, but it is `"0.5"` (`kit/define/version.js`) and kit/package/README.md says so. Haiku used 0.5.
- **`spaces: { pure: true }`** (Haiku): it misread the placeholder `spaces: { <space>: { pure: true } }` and said so itself. D012 fixed it in one run.
- **The type of `cell` in an image op** (Haiku): the draw README's op table gives no field types.
- **A Draw output's list in a test** (all three asked again). It is parked (package/README.md, "Not here").
- **A test's own Program** (Sonnet game: to test the level's edge; score: a shorter round). It is parked.
- **`Event<{}>`** (score): an input record with no fields is accepted. The docs never say so.

## Compared with 2026-11-26 and the tests dogfood

| Run | Leg | Turns | Rating | Harness outside the kit | Tests |
|---|---|---|---|---|---|
| M4, 2026-11-26 | game run 1 / run 2 / score | 27 / 22 / 22 | 5 (a checker defect) / 2 / 2 | every author ([M4 findings](2026-11-26-m4-trial-findings.md)) | none possible |
| tests dogfood, 2026-11-27 | game 3 / score 1 / score 2 | 21 / 18 / 14 | 2 / 1 / 2 | none | 3 / 4 / 3, in a simulator, from a worked example the legs copied |
| this rerun | game Sonnet / game Haiku / score Sonnet | 27 / 42 / 17 | 2 / 3 / 1 | none | 3 / 5 / 3, on the real kit, from placeholders |

- **Harness: gone, and it stays gone.** As in the tests dogfood, no author wrote one. This time the tests ran on the real kit, and the docs held placeholders, not a worked example.
- **Copying: also gone.** The names, levels and test names are each leg's own: `cavern`, `gridgame` and `roundkeeper`, not `gemgrid`, `gemmaze` or `tally`.
- **Turns: the Sonnet legs are within the earlier range.** The game's 27 matches M4's run 1, and the score's 17 sits between the tests dogfood's 14 and 18.
- **Rating: the same as before** (1 and 2) on Sonnet. The Haiku leg's 3 is the first Haiku author leg of this trial, so there is no earlier number to compare.
- **Where the extra game turns went:** each game leg spent one check run on the demand clock, and its reading on the Control form. Neither cost is in the tests design.

## Recommendations (kit; not fixed here)

1. **A demand part with nothing to make an instant should say so, or step.** The cheapest fix is a warning when a run, a test or a part played alone has only demand parts: say that nothing makes an instant, that records wait, and the fix (a tick or a frame clock). Logging a test's `in` record or a page input could also make an instant, which would make the docs' sentence true. Either way, correct kit/package/README.md's "a demand part's when a record is ready" for a part run alone. This is the "wrong documented cause" case: the docs state a behavior the kit does not have. Two of two game legs hit it.
2. **Put the Control kind table where kit/API.md says it is.** That means each kind's keys and record, the `keys` shape and `grid`, in define/README.md's defineUI section. Also give U017's "add buttons" fix the shape it wants. Today the table lives only in a project draft, which a package author does not get.
3. **Retire package/README.md's ruling quote of the D-pad's seam** ("`Event<{ up: bool, … }>` for the pad"). It describes the retired pad, and it hands authors the founding example's set.
4. **Correct kit/define/README.md's `KIT_VERSION` ("0.4")** to 0.5.

## Reproducing

```sh
scripts/m4-trial/run-tests-dogfood.sh game  /private/tmp/aWrZQr-game-sonnet  sonnet   # sandbox off: claude reads ~/.claude
scripts/m4-trial/run-tests-dogfood.sh game  /private/tmp/aWrZQr-game-haiku   haiku
scripts/m4-trial/run-tests-dogfood.sh score /private/tmp/aWrZQr-score-sonnet sonnet
node scripts/seams-trial/summary.js /private/tmp/aWrZQr-game-sonnet /private/tmp/aWrZQr-game-haiku /private/tmp/aWrZQr-score-sonnet --skip-last
node scripts/draw-trial/record.js /private/tmp/aWrZQr-game-sonnet scripts/m4-trial/runs/2026-11-27-tests-rerun/game-sonnet   # and the others
node scripts/m4-trial/tests-dogfood/check.js --role game scripts/m4-trial/runs/2026-11-27-tests-rerun/game-haiku/gridgame
node scripts/m4-trial/tests-dogfood/scan.js /private/tmp/aWrZQr-game-sonnet
node scripts/m4-trial/tests-dogfood/mutate.js scripts/m4-trial/runs/2026-11-27-tests-rerun/score-sonnet/roundkeeper roundkeeper.runtime.js 'if (event.$T - start < record.seconds - EPSILON) ' ''
```

Each leg's `REPLY.md` is its closing reply, saved by the integrator from the transcript's result and marked as such.
