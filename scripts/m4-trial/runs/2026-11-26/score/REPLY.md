*Saved by the integrator: the leg's closing reply (turns 22, 102 s, $0.56).*

**Difficulty: 2 out of 5.** I wrote the `scoretimer/` package with two examples, and `./check.sh scoretimer` exits 0. `REPORT.md` has the sections R6 lists. The checker sends no events, so scoring, point weighting, the end-of-round cutoff and the target colour have never been run. I also haven't looked at the picture.

**Hardest part:** timing the round. The run docs list `ctx.T` among what `init` is handed, but it was `undefined` there, so my first run failed with N002. I now leave the start time empty and take it from the first step, assuming that step happens at the instant the part starts. If it is one tick later, every round ends 0.1 s late, and nothing I could run would show it.
