# Controls draft: dogfood findings

*2026-11-27, leaf `822dDs` (container `1ymuQu`), by controls-dogfood-56. Subject: [the declared-Controls draft](2026-11-27-controls-draft.md), not built. Method: the local dogfood ruling (AGENTS.md) on the pattern of [the anchor dogfood](2026-11-27-anchor-dogfood-findings.md): blind `claude -p` legs write declarations on paper against a placeholder reference built from the draft, and the hand-ins are checked by the draft's rules. Tool and records: [scripts/controls-dogfood](../scripts/controls-dogfood/README.md), `runs/2026-11-27/`. Ben's tiers: Sonnet plus Haiku, never Opus; one leg is not a game.*

## Result

Three legs ran twice, once on the draft as handed over (round 1) and once after the clarifications below (round 2). The draft's *shape* survived: all six hand-ins declare Controls bound by name, with the right kinds and seams, without a leg inventing a kind or a key (R2 held). What failed was the draft's *prose*: its API sections leaned on the worked examples (cut from the legs' copy, as the local ruling asks) for facts the examples alone held. Round 1 found about a dozen such gaps and one misreading with a real cost (a Control merged to fit a layout); round 2, on the revised text, found a handful of smaller ones (fixed in the draft, listed under row 12 below) and left six choices for Ben (draft questions 13 to 18). Total cost $0.49.

| Round | Leg | Model | Turns | Time | Cost | Difficulty (its own) | By the checker (`check.js`) |
|---|---|---|---|---|---|---|---|
| 1 | game | Sonnet 5.5 | 6 | 59 s | $0.213 | 2 | ok |
| 1 | synth | Haiku 5.5 | 9 | 89 s | $0.021 | 4 | U014, U003 (the tile has no `body`) |
| 1 | lens | Haiku 5.5 | 8 | 80 s | $0.019 | 3 | U014 (the tile has no `body`) |
| 2 | game | Sonnet 5.5 | 7 | 45 s | $0.202 | 2 | ok |
| 2 | synth | Haiku 5.5 | 9 | 87 s | $0.022 | 3 | ok |
| 2 | lens | Haiku 5.5 | 9 | 56 s | $0.016 | 4 | ok |

Numbers are from each transcript's final `result` line (`save-run.js` prints them). Every leg read only files in its own folder (the `file_path` of every Read, Write and Edit in each transcript: none outside).

The round-1 checker output is from the final `checks.js`, run on the saved hand-ins. Two checker bugs surfaced while reading them, both fixed in `checks.js` before the numbers above were taken: it missed a keyed Control whose input lacks `key` (the draft's build-plan test 3), and it refused a part-local `each` Control whose `to` is per entry, which the draft allows.

## Per leg

### game (Sonnet): a pad and two buttons as Controls, a part alone, a glue

**Checks** ([checks.md](../scripts/controls-dogfood/checks.md), G1 to G6, C1 to C9):
- Round 1: C1 to C9 pass, G1 pass, **G2 fail** (the pad and both buttons are one `buttons` Control of six), G3 pass, **G4 fail** (`perFrame: 12`), G5 pass, G6 half (the wires are right, `reset` included; only the game's picture is shown).
- Round 2: all pass. The pad and the buttons are two Controls in a tile `row`; no `perFrame`; `examplePreset("game", game, build, { ui })`; three wires by name; both pictures shown.

**Difficulty 2 both rounds.** The `buttons` kind mapped directly.

**What misled (round 1).**
- *Layout.* The draft said a Control's `grid` lays out its buttons and a tile's body places Controls, but gave no tile shape (it appeared only in the cut worked example) and no rule for how several Controls look in the generated view. The leg merged a pad and two buttons into one Control "since `grid` is the only documented way to fix on-screen positions". That is the largest misreading of the run: it loses the one-Control-per-input binding.
- *`perFrame`.* The leg read the default (2, "a press and a release") as per button and raised it to 12 for six buttons. A `buttons` record holds every button, so the number counts records.
- *`wirePage`.* It appeared in `examplePreset`'s signature, unexplained (it is today's option, `false` to wire nothing); the leg passed it through.
- *Two codes on one button, and gamepad indices.* Only the build plan's test said "held while any code is down"; `<index>` named no layout.

**What it guessed.** Gamepad indices 12 to 15 for the directions (from the browser's standard layout); the held-state semantics of several codes; that `gamepad` may name some buttons; a `defineUI` result for `ui`.

**Massage.** Round 1: split one Control into two (about 15 lines), drop `perFrame`, add the second picture to `.show`. Round 2: none.

**Round 2 gaps left.** The consumer's max and where an input sets it (fixed: it is its runtime's `events.in`); whether a Control in a tile still shows in `controls` (fixed: it leaves); where `tiles` goes (fixed); a gamepad stick for a four-button Control (question 18); import paths and layer order (compose's, not this draft's).

### synth (Haiku): notes, three knobs, an envelope, `direct`

**Checks** (S1 to S6):
- Round 1: S1 pass (`triggers`, 12 codes, `midi`, `latency: "direct"`), S2 pass (`each` over the record, `to` of the form `arg.<name>.operator:1.ratio`), S3 pass, **S4 unresolved** (the leg wrote `curve: "log"` on a param that runs from 0, which the draft refuses, and said so), S5 pass, **S6 fail** (the tile is a bare list, no `title`, `place` or `body`).
- Round 2: all pass, with S4 met by using a linear curve and reporting the volume as a gap.

**Difficulty 4, then 3.** The hard parts were all things the draft could not say: a tile's shape, how to place a tile under the stage, a point list's write-back, a log curve from zero.

**What misled (round 1).**
- *Tiles.* The reference named components and `place: { tabWith }`, not the tile that holds them: "I wrote the tile body as a plain list. This is invented shape".
- *Point-list write-back.* The write-back table had rows for a number, string, boolean, `$.<name>` and refusals, and none for an array literal, so `points` with `to` would be refused as "anything else". The draft's own synth worked example did exactly that. A real defect in the draft.
- *Log volume.* U017's rule (log needs `min` above 0) applies to the volume param, which the synth wants from 0.
- *Part-local and `to`.* "A Control whose name is not an Event input must have `to`" left open whether `to` is per entry. The leg guessed per entry, which is what the draft meant.
- *Calls with literal arguments.* "The Ref id kit/define gives a call's lambdas": do `synth.operator("mod", {...})` calls, which have none, have an id? The leg took the task's word. kit/define's README says the id is `<tag>.<slot>#<n>` and describes it for lambdas, so the build must confirm it (draft question 16).
- *Direct latency.* The leg noted that frame-path delivery does not meet "the least delay the kit can offer", which is the draft's own stated split (ruling 10), not a surprise.

**What it guessed.** Twelve key codes (round 1 the letters A to L; round 2 the home row plus Semicolon, Quote and Enter, a task ambiguity: the task now says "pick twelve codes"); ranges for ratio; the placement of an envelope tile.

**Massage.** Round 1: rewrite one tile as `{ title, place: { splitBelow: "stage" }, body: [...] }` (about 6 lines). Round 2: none.

**Round 2 gaps left.** Log volume from 0 (question 14, with the leg's own proposal, a floor the annotation gives); the keyed-component question (fixed: every instance); optional keys (fixed); `defineUI`'s builder and the Ref id's tag (kit/define's, outside the reference).

### lens (Haiku): a Grip with write-back, a text entry, a picker, two tabs

**Checks** (L1 to L6):
- Round 1: L1 pass (a `length` Grip with `axis`, `at` and `to`, its target reaching the radius argument), L2 pass, L3 pass, L4 pass, **L5 fail** (the chart "tab" is a view component standing in for a tile), L6 pass (the leg did not invent a Grip bound and reported where the range lives). H011 was raised by my own fixture (see below).
- Round 2: all pass.

**Difficulty 3, then 4.** Round 2's score rose because the leg could see more of what it could not state, not because the text got worse.

**What misled (round 1).**
- *A Grip's range.* Both rounds: "a Grip has no `min` or `max`; the range is the Grammar's", but the task has the author write only the UI, so the range is out of reach. This is the paper task's limit more than the draft's, and the draft now says where the range lives; a UI-only narrower range is question 13.
- *`each` "with a max".* The leg read the rule as a missing max on its `lenses` list (a task defect: the task now says the list has a max of 8; the draft now says every state list has one).
- *A Control's `to`.* Is it a string or a lambda as a Grip's is? The draft meant a string (or per entry through `each`), build-time only. Both rounds the leg wanted it to read run state (the glass of "the lens being edited"); it settled for a fixed target. That is the one finding that argues for a design change (question 17).
- *The pick's file.* "`file` names an entry of `files`" gave no entry shape; the leg wrote a bare path string. Fixed with kit/define's D034 shape.
- *Tabs.* `tabWith` named "a view or tile", and the stage is neither; the leg named `"stage"`, which the draft meant. Now stated.

**What it guessed.** The Abbe axes (vd on x), the file's path, a caption `max`, the handle's axis `[1, 0]`.

**Massage.** Round 1: wrap the chart in a tile with a `body` (about 4 lines). Round 2: none.

## What changed in the draft

Every change is marked "Changed 2026-11-27 (dogfood)" in [the draft](2026-11-27-controls-draft.md); none touches a recorded ruling.

| # | Source | Change |
|---|---|---|
| 1 | all three, round 1 | A tile is spelled out: `tiles: { <tile>: { title, place: { <direction>: <view or tile> }, body: [...] } }`, the five directions, the generated views as targets, `row` |
| 2 | game, round 1 | The generated `controls` view shows Controls in declaration order, one group each, a wrapping row; a `grid` lays out only its own Control, so a pad and two separate buttons are two Controls |
| 3 | synth | The write-back table gains a row for an array literal of number pairs (a point list); build test 49b |
| 4 | synth, lens | A Control's declaration, whole: kind keys at the declaration, entries merge over it; a Control may have both an input and `to`; `to` is a string, build-time, per declaration or per entry |
| 5 | synth | A log curve needs `min` above 0 for a Control and a param alike (U012 for the param) |
| 6 | lens | A Grip has no bound; its range is the Grammar's. `each` names a list with a max (every state list has one). `to` gives the whole target, the prefix included. A Grip needs a stage but no pointer input |
| 7 | lens, synth | The `files` entry shape, `{ kind, path, note }` |
| 8 | game | `perFrame` counts records, not presses |
| 9 | game | Several codes on one button: held while any is down; `keys` and `gamepad` may name some buttons; a gamepad index is the standard layout's; S121 (a warning) for two Controls on one key code |
| 10 | game | `examplePreset`'s `ui` is what `defineUI` returned; `wirePage` is today's option |
| 11 | synth | Every call needs a Ref id, a literal-only one included: stated as a build task (49a) |
| 12 | round 2 | "The only one" binding is for a Control with an input; part-local ones have `to`; the declaration's `value` is the fallback under `each`; `curve` and `look` are optional; `tiles` is a UI key; a keyed component places every instance; a Control in a tile leaves `controls`; the consumer's max is its runtime's `events.in` |

New: S121 and build tests 49a to 49c.

## Questions for Ben

The draft's last section holds each in full (13 to 18); none changes a recorded ruling.

1. **A UI-only range on a Grip** (13). Recommend not.
2. **A log knob that reaches zero** (14). Recommend the author's own floor; the synth leg proposed a floor in the annotation instead, in both rounds.
3. **S121, one key on two Controls** (15). A warning, or an error?
4. **Ref ids of literal-only calls** (16). Needs your approval before the build if `record.js` has to change.
5. **A Control's `to` that reads run state** (17). The only finding that suggests a design change: both lens rounds wanted it. Recommend waiting.
6. **A gamepad stick on a four-button Control** (18). Recommend a `vector` Control instead.
7. **Ruling 4 (a computed argument refuses its Grip, "revisit after the dogfood") is not tested by this dogfood.** Every leg used a literal or a record-keyed address; none met a `const`. The ruling stands unrevisited, and the one trial that could test it is a leg that writes the Program as well as the UI.

## What the legs did not test

The pointer and picking (requirements 5 and 6), actions (11), the lock and blur (13), device timestamps (4), S119's merge of equal declarations (every leg wrote one UI), layering order, and a `triggers` Control's `first`. A leg that writes a Program with `id`s on its draw ops and a double-click selection would cover the pointer. The sequencer-style keyed `points`/`triggers` case was reached only by the synth's envelope.

## What was wrong with the exercise

- The reference's last section (the wiring snippet I wrote, not the draft's) showed `.show` with one output, and round 1's game leg dutifully showed one picture. Fixed in `build-reference.js`.
- The lens task said the state's targets were "the Argument addresses", and the leg read them as having no `arg.` prefix, as the glossary defines them; my fixture had them with it, so the first run of the checker raised an H011 that was mine. Fixed in the task and the fixture.
- The synth task's "twelve keys from `KeyA` upward" has no twelve-key reading on the home row. Fixed.
- The hand-in format (`export const ui = {...}`, a `ports` object with `Draw` seams) is the paper's, not the kit's: `defineUI`'s builder, the `Draw` seam spelling and the import paths of `examplePreset` and `compose` came up in five of six reports and are not this draft's to settle. That is the cost of a paper run with no checker behind it; the build's real `defineUI` will be tested against the same hand-ins massaged (the build plan's fixture work).
- `checks.js` was written before its tests (a deviation from red-first), because the hand-ins were the real test; `test/checks.test.js` followed, and the two bugs above came from reading the hand-ins, not from the tests.

## Reproduce

All from the repository root; `<leaf>` is any fresh name (the runs here used `822dDs`, `-r2` for round 2).

```sh
scripts/controls-dogfood/run.sh game  /private/tmp/<leaf>-game  sonnet
scripts/controls-dogfood/run.sh synth /private/tmp/<leaf>-synth haiku
scripts/controls-dogfood/run.sh lens  /private/tmp/<leaf>-lens  haiku
node scripts/controls-dogfood/check.js /private/tmp/<leaf>-game game      # likewise synth, lens
node scripts/controls-dogfood/save-run.js /private/tmp/<leaf>-game round1-game-sonnet
node --test scripts/controls-dogfood/test                                 # the checker's own tests
node scripts/controls-dogfood/check.js scripts/controls-dogfood/runs/2026-11-27/round2-lens-haiku lens   # re-check a kept run
```

Round 1 used the reference built from the draft before this leaf's edits (`git show b9aa9ac:project/2026-11-27-controls-draft.md` is that draft; `build-reference.js` takes a draft path as its first argument), and round 2 the revised draft; the only difference of that command's output from round 1's saved `reference.md` is the wiring section's two lines about `.show`, fixed after round 1 (the saved `reference.md` in each run is the one the leg read). The legs are nondeterministic: a rerun will not match word for word. Records: `scripts/controls-dogfood/runs/2026-11-27/round{1,2}-{game-sonnet,synth-haiku,lens-haiku}/` (hand-in, `task.md`, `reference.md`, `rules.md`, `REPORT.md`, `REPLY.md` saved by the integrator from the transcript's final message, gzipped transcript).
