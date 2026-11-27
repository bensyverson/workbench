# Your task: use both

Your folder holds two Dialect packages, written in separate sessions by two people who never saw each other's work: a grid game, and a score-and-timer. Use both to make **a timed game on the workbench page**:

- A person plays the grid game with the page's D-pad.
- Each gem the player picks up scores one point in the score-and-timer's round.
- The score and the time left are drawn **over** the game, as one picture on the page.
- The round lasts 30 seconds. Nothing more is required after it ends.

Write the glue program, `workbench.js` in your folder, which composes the two (`docs/kit/compose/README.md`), and any package of your own it needs as its own folder (for instance one whose picture layers the other two). Lay out a level and a round in the glue with the two packages' builders. The workbench page loads your folder as it is: the glue, and every package folder beside it.

**What `./check.sh` does** with your folder: loads it exactly as the page does, checks and builds the composition, then plays it on the page for 30 seconds with this pad script, from the start: right held 3 s, down held 3 s, left held 3 s, up held 3 s, then again from the top. Lay your level out so that this script picks up at least one gem. It fails on any diagnostic the kit or the page gives, and unless: the page's pad is wired to the game; something the game sends is wired to the score-and-timer; the shown picture takes both packages' pictures and draws an image; and the score-and-timer's state differs from a run with no pad input (so the play scored). It also checks that the two packages you were given are unchanged.
