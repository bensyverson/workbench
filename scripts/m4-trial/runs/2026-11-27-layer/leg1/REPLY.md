*The leg's closing reply, saved by the integrator.*

I've written the glue and `REPORT.md`, and `./check.sh` exits 0, so I'm just giving my closing summary now.

**Difficulty: 1 (easy).** `workbench.js` passed the checker on its first run with no diagnostics. The layer isn't built yet, so I haven't seen the combined picture: the checker judged the layer by the draft's rules and showed only the game.

**Hardest part:** placing the score panel over the game. The draft doesn't state which way `.frame(a, b, { scale, offset })` maps, so I assumed `b = a × scale + offset`, with the score panel as `a`. It also has no way to say "centered at the top", so I worked out the `[16, 0]` offset by hand from both packages' sizes. I made the level's top two rows solid wall so the panel hides nothing playable.
