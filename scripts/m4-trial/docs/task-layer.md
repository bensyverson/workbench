# Your task: use both

Your folder holds two Dialect packages, written in separate sessions by two people who never saw each other's work: a grid game, and a score-and-timer. Use both to make **a timed game on the workbench page**:

- A person plays the grid game with the page's D-pad.
- Each gem the player picks up scores one point in the score-and-timer's round.
- The score and the time left are drawn **over** the game, as one picture on the page.
- The round lasts 30 seconds. Nothing more is required after it ends.

Write the glue program, `workbench.js` in your folder, which composes the two (`docs/kit/compose/README.md`). Lay out a level and a round in the glue with the two packages' builders. The workbench page loads your folder as it is: the glue, and every package folder beside it.

**Layering is built in.** The kit draws one package's picture over another's with no package of your own: see `docs/kit/compose/README.md`, the section "Layers". **Don't write a package of your own** (a root package that layers the pictures is not allowed in this task); your hand-in is `workbench.js` alone, beside the two packages you were given. Where the documents are unclear, wrong, or missing something you need, that is the most useful thing you can report: say so under **Where the docs misled me**, **What I guessed** and **Gaps**.

**Reading the documents.** Some are long. Read them with your file-reading tool, by offset and limit, rather than printing them with `cat` in the shell (a long shell output is saved outside your folder, where you may not read).

**What `./check.sh` does** with your folder: it loads your folder as the workbench page does, on the real kit, builds the composition and prints each layer as the kit made it (`note:` lines: its seam, the page box and each input's conversion). It then plays it on the page for 30 seconds with this pad script, from the start: right held 3 s, down held 3 s, left held 3 s, up held 3 s, then again from the top. Lay your level out so that this script picks up at least one gem. It fails on any error the kit or the page gives (a warning is printed and does not fail), and unless: the page's pad is wired to the game; something the game sends is wired to the score-and-timer; the shown picture is a layer of both packages' pictures, the game's under the score's; the shown picture draws an image; and the score-and-timer's state differs from a run with no pad input (so the play scored). It also checks that the two packages you were given are unchanged, and that there is no other package folder.
