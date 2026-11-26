# Rubric for the why-text trial (written 2026-11-26, before any blind run)

Each hand-in (the agent's final message and its edited files) scores one point per item, 0 to 6. Scored by hand;
item R4 by `verify.js` on the agent's files brought back with `packet.js back`.

| Item | One point when the hand-in… |
|---|---|
| **R1 cause** | says the game raised `depth` on more than one tick (three: at T = 7/30, 4/15 and 3/10) while the miner stood on the first level's exit, because the cave had not rebuilt yet, so the game still read the old exit (cave@1) |
| **R2 mechanism** | names why the rebuild was late: the host forwards the game's depth to the cave's `depth` param only after each 1/10 s chunk of `runUntil`, so one forward carried 0 → 3 and the rebuild landed at T = 1/3, three game ticks after the miner reached the exit. Saying "0 → 3 in one param change" from the evidence is part of this. The intermittence (it depends on where the arrival falls in a chunk) is a bonus noted, not scored |
| **R3 distractors** | says, or clearly implies, that the roughness rebuild (cave@3, only `params` changed) and the glue save (rebuilt, nothing changed, revision kept) did not cause the skip |
| **R4 fix works** | `verify.js` passes all four sessions on their files: depth 1 with 1/10, 1/4 and 1/30 s host chunks, and depth 2 when the miner walks onto the second level's exit too. A timer or cooldown that passes by accident still scores here, and loses R5 |
| **R5 fix is principled** | the fix removes the cause rather than hiding it: the host forwards after every game instant (or the game and cave are bridged so the rebuild lands before the next game tick), or the game descends at most once per cave revision (`ctx.inputs.$rev.exit`) or per new level it has seen arrive. An invented cooldown in ticks or seconds, or a fix that only changes the chunk size, scores 0 |
| **R6 no false claims** | makes no false claim the evidence contradicts, such as that the kit rebuilt the cave three times, that the roughness rebuild changed the level, that `$rev` was what bumped depth, or that a revision bump happens on every rebuild |

Also recorded per leg, not scored: turns, wall time and cost from `claude -p --output-format json`; the agent's
CONFIDENCE and GUESSES; and every place it quoted the evidence (which lines of why.txt or which fields of the JSON it
used, and which it misread).
