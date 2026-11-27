*The leg's closing reply, saved by the integrator.*

**Difficulty: 1 of 5.** `workbench.js` is written and `./check.sh` exits 0 with no violations; `REPORT.md` has the details.

**Hardest part:** placing the score panel over the game without being able to see it. The layer isn't built yet, so the checker only plays the bottom picture. I worked out the `.frame` offset `[16, 4]` by hand from the two pictures' widths (192 and 160 px), and made the level's top two rows solid wall so the panel hides no play. The draft doesn't say which direction `scale` and `offset` apply. I read it as game position = panel position × scale + offset, which matches the conversion the checker prints, but the overlay itself hasn't been seen.
