# Draw-list paper trial: findings

*2026-11-26, leaf `e3qYus` (M4 Composition, `SPPLaM`; parent `FqsPVJ`). This trial tests the ruled draw-list draft ([project/2026-11-26-draw-list-draft.md](2026-11-26-draw-list-draft.md), "Next") before `Draw` is built. It ran as a relay of three blind `claude -p` sessions on Sonnet 5.5, one run per leg. A maze author gave the entity-shaped maze package a `Draw` output built one op per item. A particles author gave the Canvas-shaped particles package one built with a pen. A composer, working on their hand-ins, wrote a root package and glue that layer both pictures with a HUD. The packet, checker and records are in [scripts/draw-trial/](../scripts/draw-trial/README.md), and the records are in `scripts/draw-trial/runs/2026-11-26/{maze,particles,compose}/`. It is a paper trial: the checker emulates `Draw` from the packet's `draw.md` on top of the real kit.*

## Verdict

**The draft's shape held: draw lists were easy to write, nobody reached for `map`, and composing them took one array literal.** Every leg rated the task 2 out of 5. Both authors' first check was clean. The composer's one failure was a defect in the checker: the composer diagnosed it correctly without reading the checker, and declined to bend its frames to pass. With the checker fixed, the composer's hand-in, unchanged, checks clean (massage: none). The burst is drawn over the maze within one converted cell of the picked coin, and the run replays exactly.

**What the design must change is about the declared max and the constrained renderer, not about authoring.** All three agents independently hit three things:
- a `Draw` max cannot follow the built Program;
- the Game Boy's composition check compares an op count with a sprite count, so no list can reach the Game Boy;
- `tiles` doesn't scale on a wire.

The maze's bridge also came out larger than DMG's, because one op per item has no index and cannot walk a string. See the recommendations.

**n = 1 per leg, on one model.** Read the figures as one trial's anecdotes.

## The runs

Checks, codes, turns, time and cost come from `node scripts/seams-trial/summary.js scripts/draw-trial/runs/2026-11-26/maze scripts/draw-trial/runs/2026-11-26/particles scripts/draw-trial/runs/2026-11-26/compose`. Turns, time and cost are read from each transcript's final `result` line. Difficulty is the agent's own, from its `REPORT.md`.

| Leg | Model | Difficulty | Checks | Codes; first clean | Turns | Time | Cost |
|---|---|---|---|---|---|---|---|
| maze | Sonnet 5.5 (`claude-sonnet-5-5`) | 2 | 2 | none; run 1 | 9 | 82 s | $0.34 |
| particles | Sonnet 5.5 | 2 | 1 | none; run 1 | 9 | 62 s | $0.34 |
| compose | Sonnet 5.5 | 2 | 3 | W024 ×3 (a checker defect, below); never clean as run | 12 | 125 s | $0.56 |

To reproduce, from the worktree root with the sandbox off:
- `scripts/draw-trial/run.sh maze /private/tmp/e3qYus-maze claude-sonnet-5-5`
- `scripts/draw-trial/run.sh particles /private/tmp/e3qYus-particles claude-sonnet-5-5`
- `scripts/draw-trial/run.sh compose /private/tmp/e3qYus-compose claude-sonnet-5-5 /private/tmp/e3qYus-maze /private/tmp/e3qYus-particles`

The integrator's recheck, with no log: `node scripts/draw-trial/check.js scripts/draw-trial/runs/2026-11-26/compose --role compose`. It prints no violations, `run: burst of 60 particles ops drawn over the maze within 8 of (44, 68) at T = 0.4`, and `painter's order screen → dungeon → sparks → screen`. `diff -r` of the composer's `maze/` and `particles/` against the authors' hand-ins is empty.

**The checker defect.** W024 placed the picked coin on the root's frame by running its *cell* through the maze's **Draw wire** edge. That edge starts at the frame the picture is drawn in, and the maze author drew in a new `pixel` frame (×8 +4 from `cell`). So the checker looked at (5, 15) instead of (44, 68). The composer worked this out from the printed edges, predicted (44, 68), and was right. My reference maze drew in `cell`, so it never exercised this case. The fix carries the pickup's own record across the maze-to-particles Event wire, which runs through the maze's own frames, and then across the particles' Draw wire. The regression test is the recorded compose leg checking clean (`scripts/draw-trial/test/legs.test.js`).

## Bridge size against DMG's ~30 lines

| Leg | Lines added for the picture | What they were |
|---|---|---|
| maze | 43 (33 in the Dialect, 10 in the runtime; `diff` against the starting package) | the port with two layers (19), a new `pixel` frame and its edge (7), constants (3), a `things` state list (2), colors (1); the runtime keeps `things` |
| particles | 19 | the port with a 3-line pen (9), colors (6), two helpers for color and radius (3) |
| composer's root picture | 12 (the `view` port) | a backdrop rect, `...board`, `...effects`, three `text` ops. The whole root package is 80 lines, and `workbench.js` 74 |
| integrator's reference maze (`fixtures/valid`) | 17 | the port with three layers (10), state (3), runtime (3), colors (1) |

**Particles: smaller than DMG.** A pen over `state.particles` is the whole bridge. **Maze: larger.** About 10 lines go to a second copy of the grid's walls and coins as an entity list, because `each` can't walk a string and gets no index. Both maze hand-ins, the agent's and mine, did this independently. The maze author also spent 7 lines on a pixel frame, so its picture "would be a 9 by 5 pixel picture" when shown alone. That is a sign the "one unit is one pixel" rule pulls authors toward a frame made for the renderer. DMG avoided both costs because its state was already entities with positions. The draft's claim that "the bridge is small" holds for a Dialect whose state is already item-shaped, and costs a mirror list when it isn't.

## Did agents reach for `map`?

No. No builder in any hand-in calls `map` or its kin, and no W003 was printed. The particles pen used `for…of`, the maze used `each` over a list it added, and the root used array spread. The maze runtime builds its list with `flatMap`, which is legal, since a runtime is plain JavaScript. As predicted, `map` was not needed once `each` and the pen existed. The price is that the item list has to exist in state (above).

## What they guessed

- **The max.** Particles chose 10000, the Grammar's top `maxParticles`, though its examples drew at most 86. The maze chose 1025, which also caps the maze's size: "a larger maze that ran before would now stop with N002". The composer chose 11029, the sum of its inputs plus its own 4 ops.
- **What a field means.** Particles took `size` as a diameter (the old stage ignored it), colored by thirds of life, and didn't clip outside the box. The maze guessed that a `from` layer returning one op counts as 1 toward the max. The checker agreed, but `draw.md` doesn't say.
- **The root.** The composer guessed four things:
  - **Turning numbers into text.** `"SCORE " + s.score` is the only way, and the format is unspecified.
  - **Clock.** It chose `{ frame: true }`, since nothing says whether a new Draw input wakes a `demand` part.
  - **Runtime inputs.** It assumed Draw inputs don't appear in `ctx.inputs`.
  - **Empty declarations.** It assumed `slots: {}` and `events: {}` are allowed.
- **Port name.** All three named their output `view`, from draw.md's tie-break rule.

## Where the draft or the packet misled

- **The Game Boy's check at composition** (all three legs). `draw.md` says "a `Draw<<max>>` shown on a renderer whose limit is lower is refused", next to a sprite limit of 40. Every agent read the max as a count of ops and the limit as a count of sprites, and was surprised the two are compared. This is the draft's rule taken literally ("unless the op mix is narrower"), and no seam can state a narrower op mix. **So no composed list can reach the Game Boy.**
- **The author leg's Game Boy note contradicted `draw.md`** (maze leg; packet defect). `draw.md` says a renderer draws one unit as one pixel. The author legs' note said the checker fit the frame into 160 by 144 instead. The maze author quoted the contradiction. A package's list isn't shown, so the fit was the checker's own choice. The note now says so: `gameboy (not a shown list: the checker fits <frame>'s extent into the 160 by 144 screen, …, to try the profile)`.
- **Alpha** (particles). `draw.md` doesn't say what a 4-shade renderer does with alpha.

## Where the packet chose for the draft (the integrator's reading)

The draft defines the seam, the op table, the per-item and pen styles, and concatenation. It leaves the declaration syntax open. The packet chose the following, and **none of these is ruled**:

| Area | The packet's choice |
|---|---|
| builder keys | `from` alone, `each` plus `from`, `pen`, and `layers` to mix them, a pen layer stating `max` |
| ops | an `op` tag field on each op record |
| colors | `"#rrggbb"` / `"#rrggbbaa"` literals and a `colors` Dialect key. A named color crosses a wire as its value, so strangers never need the names |
| images | an `images` key holding `{ size, cell?, note }` with no pixel data. A carried image is named by its producer part |
| tiles | `-1` for an empty tile |
| other fields | `flip` as `'x' \| 'y' \| 'xy'`; one font, `"mono"`, 8 by 8 |
| Draw inputs | read as a whole-list builder's second parameter, following the draft's `(s, inp)`, unlike value inputs, which use the `inputs` global |
| builders | may not read `$`, value inputs or the record |
| which output is shown | `view` breaks a tie |
| Game Boy profile | refuses every `rect`, aligned or not ("free rects" left open) |

Agents used most of these without comment. That they could follow them says little about whether these are the right choices. Two of them did cause friction: **builders may not read value inputs or the record**. The composer copied `score`, `coinsLeft`, `width`, `height` and `title` into its state through its runtime, solely so its builder could read them.

## Gaps they reported, merged (smallest first)

1. **Formatting numbers for HUD text** (composer).
2. **"fit" into a region**, to leave room for a HUD (composer).
3. **The meaning of a negative scale for `rect.size` and `r`** after a flipping edge (maze).
4. **Whether a Draw input wakes a `demand` part, and whether it appears in `ctx.inputs`** (composer).
5. **A Program cannot style the picture**: a `.field("heat")` reaches it only if the Program writes it into `size` (particles).
6. **`each` has no index and cannot walk a string**, so the maze keeps a mirror list in state (maze, and the integrator's reference).
7. **Static layers rebuild every step** (maze). This is the draft's parked "partial redraw".
8. **`tiles` converts `at` only**, so a stretched frame moves a tile layer without scaling it (maze, particles, composer).
9. **A max cannot follow the built Program.** The examples' largest lists were 33 (maze), 86 (particles) and 226 (root), against Draw<1025>, <10000> and <11029>. The root's max is the sum of its inputs', and every limited renderer refuses on it (all three).
10. **A Draw seam says how many ops, not which kinds**, so the Game Boy check at composition refuses everything (all three).
11. **One output cannot serve different renderers** (maze); a composer cannot restyle a stranger's ops (composer).

## Recommendations: what the design must change

1. **Let a `Draw` max come from the built record**, as `extent(record)` does for a frame, so that `Draw<record.maxParticles>` is checked per composition, and keep a Dialect-level ceiling for the type. This one change shrinks every downstream max, and with it the root's sum. It is the gap all three agents hit.
2. **Give the seam an op mix, or drop the Game Boy check at composition.** Either let a seam say which ops it holds and how many of each (`Draw<image 38, tiles 1, text 40>@<frame>`), so a profile can check at composition what it can, or limit the composition check to op kinds and move the counts to draw time. As ruled, no root can ever pass the Game Boy, and agents can't tell why.
3. **Fix how `tiles` converts.** Either scale the cell size by the edge (a renderer that can't scale tiles refuses a non-unit scale, as the Game Boy refuses a scaled image), or say outright that `tiles` is renderer-space only and refuse it across a scaling wire.
4. **Decide what a builder may read.** Let builders read the record and value inputs, read Draw inputs the same way value inputs are read (the `inputs` global rather than a second parameter), or rule that a root mirrors them into state. Today's packet choice cost the composer a runtime written only to copy them.
5. **Per-item over non-entity state.** Either give `each` an index (`(item, i, s)`), or accept and document that an entity-style Dialect keeps an entity list in state, as DMG did. With an index the maze's walls still need character access, so the honest choice is probably the second one, plus a `tiles` op the maze's grid can feed (which depends on 3).
6. **Spell out what the draft leaves to the reader**, before the build:
   - how a `from` layer counts toward the max;
   - what a negative `size` or `r` means;
   - what a 4-shade renderer does with alpha;
   - how text is formatted;
   - whether a Draw input wakes a `demand` part;
   - which of several Draw outputs the page shows.
7. **Keep the three builder styles and concatenation as drafted.** They were the part that worked: no `map`, no workarounds, and layering was one array literal.

## The trial itself

- **Blindness.**
  - All three agents printed `check.sh` and `hash.sh`, which name repository script paths. They said so, and opened none of them.
  - The composer read one file under `~/.claude/projects/…/tool-results/`. It was the harness's saved copy of its own over-long printout of `particles/`, so the composer saw no content from outside its folder.
  - The checker prints only the message of a crash, never the stack, after the seams relay's leak.
- **What the checker emulates.** It runs builders as plain JavaScript and types the ops they produce at run time; the kit would lower and type them statically. It does scan each builder's source with kit/parse and refuses free names. Each Draw port is put back into the real Dialect as an `Event<{ at: point2@<frame> }>` port. That way kit/compose checks the Draw wires for S111, S112 and S251, prints them as `Draw<…>@<frame>`, and plans the frame edge the checker uses to convert ops.
- **Saved by the integrator.** Each leg wrote its own `REPORT.md`. Their closing replies are saved as `REPLY.md` in each record, marked as saved by the integrator.
