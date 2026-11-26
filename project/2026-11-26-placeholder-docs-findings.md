# Placeholder snippets against a worked example: findings

*2026-11-26, leaf `KTrmEL` (M4, `SPPLaM`). Ben's question: do worked examples color agents' output too much? The seams relay rerun ([its findings](2026-11-26-seams-relay-rerun-findings.md), relays A and B) found its authors choosing `pos` and a composer naming its composition `light-show`, both names from the docs' drums-and-board example. This leaf tests option 2: the same docs with every code snippet written in angle-bracket placeholders (`<port>`, `<field>`, `<frame>`, `<part>`, `<slot>`) and no worked domain example, run as two more relays, C (Sonnet 5.5) and D (Haiku 5.5). Packet: `scripts/seams-trial/docs-placeholder/`, launched with `PACKET=placeholder scripts/seams-trial/run.sh <role> /private/tmp/KTrmEL-relay/<leg> <model>`. Records: `scripts/seams-trial/runs/2026-11-26-placeholder/{c,d}-{maze,particles,compose}/`.*

## Verdict

**Placeholders cost nothing we could measure, and they removed the two names that traced to the example, but the example was a small source of coloring.** No leg on the placeholder docs made a syntax slip, turns were the same or fewer, and difficulty was the same wherever a leg wasn't blocked by a gap both arms share. Most of the names every relay chose come from the task and the packages themselves, not the docs: `pos` on the particles side is the particles package's own per-particle field, and `burst`, `pickup`, `sparks`, `cell`, `box` and `wind` all appear in both arms. One thing still leaked through the placeholder docs: **a literal number.** Relay D's particles author copied the snippet's Event max `8`, and that is half of why relay D's composition stops at S116. **Recommendation:** in kit/START.md and kit/API.md, write the names an author chooses as placeholders, with a short "reading the snippets" note, and also replace numbers the author must choose with a placeholder and a rule. Do it as its own leaf. It is cheap, but don't expect it to make strangers' names meet: what makes them meet is shared task vocabulary, and when they don't meet, `rename` bridges them.

**n = 1 per model per arm.** Every comparison below is one run against one run. A name that differs between A and C could differ between two runs on the same docs. Read the figures as anecdotes that agree or disagree with the hypothesis, not as measurements.

## The arms differ in more than the snippets

Relays A and B ran on `scripts/seams-trial/docs/` at `055a0b0`. Commit `829ddef` then fixed those docs: it added `runtime.md`'s "The built record, and values at the boundary" section, the clock fallback, how `rng` is seeded, that `ctx.controls` is always an object, a particles sample for the `#n` kernel ids (`particles("fx")…force("fall")…force("wind")`), the `edges` placement in `seams.md`, and "Near and new" in `rules.md`. It also changed the checker's G008 and G013. The placeholder docs were written from the docs at `829ddef`, so arm C/D also had every runtime fix arm A/B lacked. Anything about the runtime contract (N004 counts, runtime difficulty) is confounded by that, and is not attributed to placeholders below. Names and syntax are less exposed: of the names `829ddef` added, only `fx` and `wind` appear in any leg, and see the table for those.

## The runs

Checks, codes, turns, time and cost: `node scripts/seams-trial/summary.js <leg-dir>...` (A/B with `--skip-last`, because their logs end with the integrator's recheck; C/D logs have no such line). Turns, time and cost come from each transcript's final `result` line. Difficulty is from each `REPORT.md`.

| Leg | Arm | Model | Difficulty | Checks | Codes (all runs); first clean | Turns | Time | Cost |
|---|---|---|---|---|---|---|---|---|
| a-maze | example | Sonnet 5.5 | 2 | 3 | none; run 1 | 10 | 116 s | $0.36 |
| c-maze | placeholder | Sonnet 5.5 | 2 | 2 | none; run 1 | 10 | 106 s | $0.35 |
| a-particles | example | Sonnet 5.5 | 2 | 7 | G001–G004, N004 ×7, G008; run 2 | 15 | 149 s | $0.49 |
| c-particles | placeholder | Sonnet 5.5 | 2 | 6 | N004 ×7, G008 (a deliberate probe, says its report); run 1 | 10 | 152 s | $0.48 |
| a-compose | example | Sonnet 5.5 | 1 | 3 | none; run 1 | 17 | 75 s | $0.37 |
| c-compose | placeholder | Sonnet 5.5 | 1 | 3 | none; run 1 | 12 | 66 s | $0.36 |
| b-maze | example | Haiku 5.5 | 3 | 3 | none; run 1 | 25 | 109 s | $0.03 |
| d-maze | placeholder | Haiku 5.5 | 2 | 3 | G001–G004; run 2 | 17 | 125 s | $0.03 |
| b-particles | example | Haiku 5.5 | 4 | 5 | G001–G004, N004 ×3; run 4 | 29 | 210 s | $0.06 |
| d-particles | placeholder | Haiku 5.5 | 4 | 3 | G001–G004, N004 ×8; **never clean** | 26 | 202 s | $0.05 |
| b-compose | example | Haiku 5.5 | 2 | 2 | none; run 1 | 19 | 93 s | $0.03 |
| d-compose | placeholder | Haiku 5.5 | 4 | 2 | checker failure ×2 (S116); **never clean** | 28 | 90 s | $0.03 |

G001–G004 on a first run are the starting package checked before any change; every author run does that once. Sums by arm: Sonnet 42 turns, 340 s, $1.22 (A) against 32 turns, 324 s, $1.19 (C); Haiku 73 turns, 412 s, $0.12 (B) against 71 turns, 417 s, $0.11 (D).

**Relay C** is clean at every leg: the integrator's recheck (`node scripts/seams-trial/check.js /private/tmp/KTrmEL-relay/c-compose --role compose`, no `SEAMS_TRIAL_LOG`) plans `pos: maze.cell → particles.box, point, ×32 +16; drops score, left`, bursts 120 particles within 32 of (144, 48) at T = 0.25, the pickup's own instant, and replays exactly.

**Relay D did not finish clean, and neither failure is about the placeholders.**
- *d-particles* refuses, in `init`, every Program that declares a `.field()`, so four of its six old examples stop with N004. This is the per-Program state gap the rerun found (b-particles worked around it with a capped list; the smoke leg dropped fields). d-particles reported it as gap 1 instead of working around it, which is what the brief asks. Its new example passes G008.
- *d-compose* stops at S116: d-maze declares `events: { out: { coin: 64 } }` (its walk cap) and d-particles `events: { in: { pickup: 8 } }`, so one maze step can overflow a particles step, and nothing a glue can say changes either max. The composer said so, did not touch the packages, and rated 4. With one number changed in a copy (`pickup: 64`, rehashed; `/private/tmp/KTrmEL-massage-d`, not recorded), the same `workbench.js` checks clean: `×36.363636364 +[0, 40.909090909]`, a burst of 12 within 36.364 of the converted pickup at T = 0.133, replayed. The composer had predicted that offset (40.9) by hand. So the glue was right, and the massage is one number in a package.
- **The checker failed on S116.** `checkComposeLeg` checked the composition without the runtimes, so the runtimes' Event maxes were only seen when it built the composition, which threw. The composer saw "the checker failed" and a stack trace naming the repository's paths (a leak in the leg's blindness), not an S116 diagnostic. Fixed in this leaf: `loadCompose` now checks with every runtime when all are present, and `scripts/seams-trial/test/legs.test.js` holds it. The recorded log keeps the two `crash` lines. The integrator's recheck now prints `workbench.js:45: S116 …` with both sides and the fix.

## Names chosen, and where they come from

| | A (example, Sonnet) | C (placeholder, Sonnet) | B (example, Haiku) | D (placeholder, Haiku) |
|---|---|---|---|---|
| maze Event output | `pickup: Event<{ pos, vel, score, left }>` (+ `move`, `bump`, `finish`) | `pickup: Event<{ at, score, left }>` (+ `entered`, `bumped`, `cleared`) | `pickup: Event<{ at, left, when }>` | `coin: Event<{ at, when, score }>` |
| maze value outputs | `player`, `velocity`, `score`, `coinsLeft`, `cellSize`, `done` | `player`, `velocity`, `period`, `score`, `coinsLeft` | `where`, `coinsLeft` | `position`, `elapsed`, `score`, `coinsLeft` |
| particles Event input | `burst: Event<{ pos }>`, read as `burst` | `burst: Event<{ pos }>`, read as `burst` | `burst: Event<{ pos }>`, no `record` | `pickup: Event<{ at }>`, read as `pickup` |
| particles value inputs | `intensity`, `wind`, `anchor` | `target`, `wind`, `intensity` | `wind` | `wind` |
| frames | `cell`, `box` | `cell`, `box` | `cell`, `box` | `cell`, `box` |
| composition, parts | `coin-burst`: `hunt`, `fx` | `coin-burst`: `hunt`, `sparks` | **`light-show`**: `labyrinth`, `sparks` | `coin-burst`: `coins`, `sparks` |
| did the names meet? | yes, `pos` | no: `at` against `pos` | no: `at` against `pos` | yes, `at` |
| `rename` | not needed | found and used, `{ at: "pos" }` | found and used, `{ at: "pos" }` | not needed |

Where they trace, from reading the packet and the starting packages (`grep -rnw` over `scripts/pkg-trial/fixtures/valid/` and the docs):

- **To the worked example:** only two names in four relays. Relay B's composition name `light-show` is the example's composition. Relay A's maze field `pos` matches the board example's `flash: Event<{ pos, … }>`. On the placeholder docs neither came back: C's maze author chose `at` ("where it happened", in every record, "so one `rename` habit works on all of them"), and D's composer chose `coin-burst`.
- **To the particles package itself:** `pos` on the particles side, in all four relays. The package already has a built-in per-particle field `pos` (lambdas write `p.pos`), and c-particles, with no example to copy, said: "It matches the particle's own `p.pos`, so `burst.pos` reads naturally". The rerun findings blamed this on the example; that cause was wrong, and they now carry a correction. Also from the package: `box` (its Grammar's bounds) and `sparks` (`particles("sparks")` in its `examples/03.js`).
- **To the task text:** `burst` ("a burst of particles plays", task-compose.md), `pickup` and `coin` ("picks up a coin"), `coin-burst`, and `cell` (task-maze.md asks "where a cell is", rules.md speaks of "a maze cell worth 32 pixels").
- **To nothing in the packet:** `hunt` (both Sonnet composers), `fx` (A's composer; like `wind` below, it reached runtime.md's sample only in `829ddef`), `intensity` (both Sonnet particles authors), `wind` (all four particles authors; `829ddef` later put a `wind` force in runtime.md's sample, but A and B never saw it), `at`, `player`, `velocity`. These are the models' own habits, and they repeat across arms: **Sonnet chose almost the same names on both packets.**
- **To a literal number in a snippet:** d-particles' `events: { in: { pickup: 8 } }` is the placeholder runtime.md's `events: { in: { <port1>: 8 } }`. Its report calls 8 "a guess". The placeholders replaced every name and kept the numbers, so the number was the one thing left to copy.

On the example arm Sonnet's names met and Haiku's didn't; on the placeholder arm it was the other way round (D's `at` with `at`). With n = 1 that is a coin toss, not a trend. What both arms show is that when names don't meet, the composer finds `rename` in seams.md and uses it on its first check (B and C).

## Syntax slips and guesses caused by the missing example

None that the checker saw. No leg on the placeholder docs printed a D, K, B, L, U or S code it caused by writing the syntax wrong, and no hand-in holds a leftover placeholder (`grep` for `<field>`, `<port>`, … over the four packages finds one, in a code comment quoting the doc). Each wrote what its role needs right the first time it checked: ports, frames with `extent` and `defineRuntime` modules (all four authors), `record: { name, slots }` and `ref("in", { kind: "event" })` in the Grammar (both particles authors), and `.frame(…, "fit")`, `.wire(…)` and, in C, `{ rename }` (both composers). The `edges` slip the rerun's smoke leg made (D030) did not recur, but `829ddef` fixed that doc in both arms, so it says nothing about placeholders.

What the agents said they had to guess that a full example might have answered:
- d-maze: whether a `from` lambda may do arithmetic (`s.player.x + 0.5`; the snippet shows only `[s.<path>.x, s.<path>.y]`), and what a `string[]` slot looks like in the record, since the frame snippet shows only `record.<slot>`. It guessed right on both.
- c-maze: it saw "no documented example of a constant output" and didn't try one. A-maze, on the example docs, offered `cellSize: from: () => 1`, but the example docs have no constant output either, so this is not clearly the placeholders.
- d-particles: the Event max (8, above).

What misled them is the same text in both arms: c-particles quoted runtime.md's "you set the others your Dialect declares" (it never set its `Math` global, and the lambdas ran), and the record bullet's `{ <name1>: "…" }`, whose values are not strings for its `.field`s and counters. Both sentences are word for word the example arm's, with names swapped.

**Nobody remarked on the placeholders.** No report mentions angle brackets, and no transcript shows an agent typing one into code.

## Other findings

- **kit/package's generated reference names a frame neither package has.** Its header line reads "rates such as `vec2@px/s`" (`kit/package/reference.js:45`), and c-compose wondered whether to look for a third frame. It leaks a name into every composer's `reference.md`, in both arms. A kit change, so not made here: it should say `vec2@<frame>/s`, or use one of the package's own frames.
- **The Event max gap bites a composer.** D's S116 is the rerun's gap "An Event max is one constant" (a-maze) seen from the other side: a composer can't do anything about a mismatch between two strangers' maxes. d-compose asks for a per-wire bound or a Program-derived max, and for `reference.md` to show each Event port's max and delivery so S116 isn't a surprise. That belongs with the rerun's "For Ben" item on optional record fields, as a ruling on how maxes are declared and shown.
- Both D authors said the per-Program state gap and the Event max gap in their own words, which agrees with the rerun's list.

## Recommendation for kit/START.md and kit/API.md

1. **Write author-chosen names as placeholders** in the snippets that show syntax, with one short note on how to read them ("a word in angle brackets is a name you choose; everything else is literal"). In this trial that cost no turns and caused no syntax slips, and it removed every name traced to the example.
2. **Write author-chosen numbers as placeholders too** (`events: { in: { <port>: <max> } }`), next to the rule for choosing them, or the number is what gets copied.
3. **Keep the kit's own words literal**: keys, handles, seam type spellings, punctuation. The note has to say which is which, and the placeholder docs' wording worked for both models.
4. **Keep one complete, tested example out of line** (as `scripts/seams-trial/fixtures/example/` is, tested line by line by `test/example.test.js`) for a reader who wants to see a whole working thing, linked from the doc rather than inlined in its snippets. This trial didn't test whether anyone needs it, so it is a hedge, not a finding.
5. **Don't count on this to make names meet.** Names met in two relays out of four, one per arm, and each relay's names came mostly from the task and the packages. `rename` is what makes composition work when they don't.

To be filed as a separate leaf, as the job's description says ("If placeholders cost little, the same treatment goes to kit/START.md and kit/API.md").
