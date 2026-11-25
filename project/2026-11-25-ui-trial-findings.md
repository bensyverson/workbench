# The UI DSL trial: findings

*2026-11-25, leaf `vp27OC`. Two rounds of three blind agents each (Opus 5.5, Sonnet 5.5, Haiku 5.5) wrote the particles and maze UIs from the [draft](2026-11-25-ui-dsl-draft.md) alone. The packet is [`scripts/ui-trial/`](../scripts/ui-trial/README.md); records are in `scripts/ui-trial/runs/2026-11-25-first/` (agents a–c) and `runs/2026-11-25-rerun/` (d–f). Ben was not around; the tier mix follows the leaf (one per tier), not the handoff's "2 Sonnet, 1 Haiku".*

## Verdict

**The declaration form works:** all six agents checked clean on their first checker run. Their hand-ins needed no change to comply: each state matches `text(state)`, and each element imports nothing, dispatches only `wb-pick` with `bubbles` and `composed`, and handles no keys. The difficulty scores were 2, 1 and 2, then 2, 2 and 2.

**The first round was weaker evidence than it looked.** The draft's worked example and its tile and annotate snippets were the particles answer (items 1–5, 7, 8, and 9's tab, nearly word for word). For those items the round tested copying. Before the rerun, every example moved to an `orbits` package that is not in the task. The rerun stayed at 2, 2, 2 and clean first time, so the form holds up when it is not handed over.

**The trial does not answer open questions 1 and 2** (where the state's type and the inputs live). The agents use whatever the draft says, so they show that the draft's placement is learnable, not that it is right.

## Figures

From `node scripts/particles/h5/summarize.js <agent dirs>` over the live directories (`/private/tmp/3d093c96-ui{,2}/agent-*`), before they were copied. `check.sh` checks two packages, so "checker runs" counts packages.

| Agent | Model | Turns | Time | Cost | Checker runs | Difficulty |
|---|---|---|---|---|---|---|
| a | Opus | 5 | 81 s | $0.48 | 4 | 2 |
| b | Sonnet | 6 | 68 s | $0.25 | 2 | 1 |
| c | Haiku | 9 | 101 s | $0.02 | 2 | 2 |
| d | Opus | 5 | 87 s | $0.49 | 4 | 2 |
| e | Sonnet | 5 | 71 s | $0.25 | 4 | 2 |
| f | Haiku | 9 | 101 s | $0.02 | 2 | 2 |

None read a file outside its directory (summarize's "outside" lines are heredoc text naming `kit/define`).

## Round 1 findings and the changes they caused

1. **`runs` counted ticks**, which a UI cannot turn into run time because it cannot read the Program's tick (all three). **Changed:** `runs` takes `seconds` (more than 0, at most 3600), run at the Program's own tick. The checker, its tests, the fixture, `rules.md` and both draft documents moved with it. In the rerun, all three wrote `seconds: 5`, and item 6 went from "partly fits" to "fits".
2. **What `$` is in a swept run, and what a Program without the param shows** (a, b, c). **Changed:** inside `runs.y`, `$` is that run's params with the param at its swept value; a missing param gives an empty chart; both ends are included; values are clamped to the param's range.
3. **The element's update order, early properties and sizing** were guessed by all three. **Changed:** the host sets `params`, then `text`, then `state` last, so an element draws on `state`. Properties may arrive before the tag is defined. The element fills the box the host gives the view.
4. **"(a number)" in the components table read as a path only** (c). **Changed:** one sentence says it means a path or a lambda.
5. **`text` is both a view id and a component kind** (a). **Changed:** a pitfall line. A rename is possible, but it waits on the build.

## Round 2 findings

Fixed in the draft right away (wording, no new API):

6. **The orbits example called a bare `abs`**, which neither package's Dialect gives (particles has `Math.abs`). Haiku caught it. The integrator wrote that example, so this was its error, and it would have taught an agent a U007. **Changed:** `Math.abs`, with a sentence that a lambda calls only what its own Dialect gives.
7. **Whether `stage` exists when a package declares no element** (d). **Changed:** `stage` is always present and always a `place` target.
8. **"Fills the box" while a custom element is inline by default** (e). **Changed:** the element gives itself `:host { display: block }`.
9. **Whether a UI lambda may build a string** (d, f). **Changed:** a lambda gives only string literals or strings read from the state. It cannot join or format them. This is the draft's rule, not a check of the kit: Bench has no string type today.

Left for Ben (new API, see the questions below):

10. **A readout against a maximum** (d, f; a and b worked around it with two stats). With no way to format "312 / 500", item 1 becomes two stats.
11. **A named derived value** (d): `s.particles.length` appears five times, and `traces` cannot show it because the state holds the list, not its length.
12. **Composition, all six:** nothing lets one package's run reach another's ("coins burst into particles"). The draft never shows a cross-package `annotate` key, and it does not say whose `s` and `$` such a key's lambda reads. `defineUI` gets only its own builder, so it cannot check a qualified id. Absent packages, load order, cross-package cycles, two `inputs` sharing keys, and which stage gets focus are all unsaid. Data flow between runs belongs to seams and ports (`hjdIRt`), not to `defineUI`.

## Task-sheet notes (not the draft)

- Item 9's "a tab with it" was read as the readouts tile by five agents and as the stage by one (f); both are legal.
- Defaults the draft leaves open: a table's `limit` and `runs.steps`. Every agent chose `steps: 9`.

## Not tested

The checker does not run a host, load an element, type a lambda's result, or compare the state with what `text(state)` reads. These were read by hand on all six hand-ins, and none was wrong. No element was run in a browser.
