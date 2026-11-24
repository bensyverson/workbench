# Composition paper trial: findings

*2026-11-24, leaf `ZCE0qf`. Three fresh agents composed three draft dialects (`cave`, `tiles`, `glow`) into one game, *Glowworm Deep*, from the packet in [scripts/compose-trial/](../scripts/compose-trial/README.md) alone. Nothing about composition is built; the checker's stand-ins check calls against the draft. Design under test: [the architecture synthesis](2026-11-24-architecture-synthesis.md) §3.5. Hand-ins, reports and checker logs: `scripts/compose-trial/runs/2026-11-24/agent-{a,b,c}/`.*

## The result in one paragraph

The composition rules were easy, even for Haiku: all three programs checked clean on their first full run, and all three got every seam right by hand review too (outputs through `part.out`, the seed as a signal-dependent lambda, cell positions converted with `tiles`' `tile()` and exported in pixels for `glow`, one `lib/` noise helper on CPU and GPU, `reach` read at build time and in kernels). The checker therefore caught nothing in seven runs, so this trial measures the draft's clarity, not the checker. **What all three hit instead was time and units, not types:** none could stop the miner from descending twice while the new level loads, because the draft does not place the reload within a tick and the game cannot tell which level it is on; and two of three found that a *length* in cells has no named conversion to pixels, so they wrote `* 8` by hand where no check can see it. That is the consults' prediction (binding time and identity across edits are the hard seam problems, not types), now observed. A caveat bounds the result: the three programs are nearly identical in shape, because the references' examples and the task's prose lead closely to one answer; the trial shows the rules can be followed, not that a model can design a composition it has not been shown.

## The runs

| Agent | Model | Difficulty | Checker runs (clean) | Tokens, tool calls, time | `// GAP:` marks |
|---|---|---|---|---|---|
| A | Opus 5.5 | 3 / 10 | 4 (3; the first ran before `program.js` existed) | 63k, 6, 93 s | 3: reload order, `lerp` across a reload, cell length |
| B | Sonnet 5.5 | 2 / 10 | 2 (2) | 60k, 4, 50 s | 3: reload, cricket hop, exit drawn by position |
| C | Haiku 5.5 | 5 / 10 | 1 (1) | 81k, 10, 106 s | 2: cell length (twice); reload handled with an invented cooldown |

Model ids are the session's (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). B's four tool calls looked too few to have read five documents; its program uses API found only in `tiles.md` and `cave.md` (`.look`, `w.touching`, `.spawns(... where)`), so it read them, in batched calls. All three hand-ins recheck clean from `runs/` (`node scripts/compose-trial/check.js scripts/compose-trial/runs/2026-11-24/agent-x`).

## Where they converged

| Finding | A | B | C |
|---|---|---|---|
| **A level reload has no place in the tick, and the game cannot tell which level it is on**, so standing on the exit raises `depth` twice | GAP | GAP | worked around: a 120-tick cooldown in world state, its own invention |
| **A length in cells has no named conversion to px**; "prefer the named conversion" cannot be followed for scalars, and `$.reach * 8.0` is untagged, so no check sees a wrong scale | GAP | silent (hard-coded `* 8.0`) | GAP (twice) |
| `num(...)`'s signature is undocumented; all guessed `num(default, min, max, label)` | yes | yes | yes |
| Unary `!` (and `===`) are not in the kernel subset's list | avoided `!` | — | used `=== false` |
| Whether an actor's own `.state` fields are assignable | guessed yes | — | guessed yes |
| The exit's glow had to come from an exported pixel position; the exit has no tile of its own | did so | GAP | did so |
| The seam structure itself: every agent wrote the same five seams the same way | yes | yes | yes |

## Where they diverged

- **The double descent:** two marked it as a gap; Haiku invented a cooldown, which the rules forbid only in spirit (R11) and which hides the problem. One invention in three, from the smallest model, is the signal that the design must supply the answer.
- **Silent versus marked units:** Sonnet hard-coded the cell size with no `// GAP:`; Opus and Haiku marked it. The checker treats all three the same.
- **Hops:** only Sonnet noted that `tiles` cannot express a hop; the others let crickets glide without comment.

## Where the packet misled them (quoted from it)

- *"Prefer the named conversion: it says what you mean, and it stays right if the cell size changes."* (draft, Frames): sent A and C looking for a length conversion that does not exist.
- *"the game raises `depth` on tick n; the cave steps on demand after that tick; the game sees the new cave on its next tick."* (draft, Time): describes the cycle but not where the reload falls, so all three wrote a bump that can fire twice.
- *"`"lerp"` … Smooth motion for a `frame` part reading a `tick(60)` part."* (draft, Time): right in general, wrong across a reload, where the light sweeps from the old exit to the new start for a frame (A).
- The draft's `lib/` sample `noise` interpolates along x only, so it is striped (B, C). A packet bug.
- *"`.spawn(kind: Actor, from: Spawn[], opts: { kind: string …`"* (`tiles.md`): `kind` names both the actor and the spawn kind (B).
- `tiles.md`'s reload rule does not say whether the player's position is reset (C), and `.export`'s reference does not say whether its `read` lambda may read another part's output or a parameter (C).

## What this changes in the composition design

1. **Reloads and revisions are part of the time model.** A dependent part's reload happens at a defined point (proposed: at the start of the consumer's tick, before input and updates), and the consumer can see **which revision** of an input it holds (`level.out.cells` carries a revision; a `w.loaded(level)` or an `on('reload')` hook). This is the identity / revision / content-key split from [Manuel's gist](https://gist.github.com/wesen/2c6e5beb40c65cfdb958c240d2de63e0) (synthesis §3.7), found by the agents without being told. Sampling modes need a reset rule across a revision change (`lerp` snaps).
2. **Frames are affine, and lengths have frames too.** A frame edge (`cell → px`) carries a scale and an offset; a position conversion uses both, a length conversion only the scale. Tag scalars that are lengths (`f32@cell`), give the consuming dialect a length conversion (`tiles.len(r)` or `tile.size`), and let the checker see `* 8` on a tagged length as the S251-class mistake it is.
3. **Fix the packet's slips** before any rerun: the striped `noise` sample, `num()`'s signature, `!` and `===` in the subset list, assignable actor state, the `.spawn` `kind` clash, whether the player is reset on reload, and what an export's `read` may see.
4. **The next composition trial must be harder.** This one confirms the rules are learnable; it does not test composing dialects written in separate sessions with no shared examples, which is Ben's real pattern (synthesis §2). Run it once the Composition milestone has two such dialects (leaf `IhJ35P`), with a task whose seams the references do not illustrate.

## Hand review and massage

Every program is correct against the draft's rules: zero lines of massage for compliance, and zero seam mistakes found by hand. For correctness as a game, A and B carry the double-descent bug and C an invented cooldown; the fix belongs in the design (item 1), not in their programs. Small slips that would matter in a real build: B removes a cricket from inside its own `update` while iterating `w.touching(self, Miner)` (allowed by the draft, but it depends on removal being deferred, which the draft does not state); C's flicker varies across the screen (`p.xy.x`) rather than only over time, a reading of the prose, not a mistake.
