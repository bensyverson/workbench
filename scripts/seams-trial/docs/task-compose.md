# Your leg: the composer

You have two packages, written by two different people who never met: `maze/` (a maze a player walks with a D-pad, picking up coins) and `particles/` (a particle system in a box of pixels). Each has a runtime. `reference.md` lists both packages' ports and frames, generated from their Dialects. Read the packages; you may not change them.

Write `workbench.js`, a glue program that uses both, so that **a burst of particles plays where the maze player picks up a coin**. Build a maze of your own (any size, with at least three coins) whose player walks one cell per step in the direction the D-pad holds, and a particle system whose burst you would want to watch. Show the particles' stage. The checker plays your workbench: it holds the D-pad toward the nearest coin and watches for the burst.

Then answer in your report:

1. **The seam.** Which output did you wire to which input, and how did you relate the two packages' frames? Did any check or the run catch a mistake you made?
2. **What did not fit.** Did the two packages' ports meet as they were written, or did something (a field name, a frame, a type, a missing port, a queue's size) stand between them? Did you use `rename` or `delay`? What would you have needed?
3. **Time.** The two parts step at different rates. From `runtime.md`, can you tell when a burst plays relative to the pickup? Was the run's answer the one you expected?
