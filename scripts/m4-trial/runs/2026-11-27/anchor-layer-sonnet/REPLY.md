I wrote `workbench.js` and `REPORT.md`. `./check.sh` **exits 1**: on its one run it refused the draft `anchor` key with S257, as the task expected, so the "exits 0" definition of done isn't met.

The refusal was the only output, so nothing past it is verified: not the play, the layering, the wiring or the score change. From reading the docs and package source, I expect the wire queue limits to hold and the pad script to pick up at least two gems. I left the anchor in place and didn't swap in another edge to get further.

**Difficulty: 2 out of 5.**

**Hardest part:** knowing whether the rest of the glue is right when the one expected error hides every other check. The composition itself was short: the pad goes to the game, each pickup sends one point to the round (`set: { points: 1 }`), and the score is layered over the level. The anchor needed some care: you anchor on `level.frame.px`, not `cell`, which you only learn from the game's Dialect. The draft also can't put the panel outside the level, so I made the level's top two rows solid wall for the panel to sit on. S257's message is also misleading here: it mentions rotation and suggests `scale: 32` or `"fit"`, both wrong for a text panel.
