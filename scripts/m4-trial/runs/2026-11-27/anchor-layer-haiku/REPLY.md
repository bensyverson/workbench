**Difficulty: 3.** The glue is short, but `./check.sh` cannot exit 0 with the anchor in place, which this test requires, and it stops at that error. So the layer plan and the 30-second play were never checked.

**Hardest part:** Placing the score panel without an offset. The `anchor` key on the glue's `.frame` edge is in the compose README's unbuilt draft, so the checker refuses it (`workbench.js:28: S257`). I kept it, as the task says, and did not work around it. The checker's fix line offers `{ scale: 32, offset: 16 }`, a hand offset copied from the README's example, which doesn't fit this layout. I also couldn't confirm that `set: { points: 1 }` on the `picked` → `scored` wire is the right fix: the producer's `collected` is a running total, so a plain wire would be risky. The checker never reached that wire, so the choice is unverified. My expected play (two gems in the first pass) comes from reading the gemgrid runtime, not from a run.

Files are in `/private/tmp/wCDTzk-haiku`:
- `workbench.js`: the glue
- `REPORT.md`: the report, with the sections in R6's order, including the Gaps and the docs I could not reach

I ran `./check.sh` once, and it exited 1. Neither package was modified.
