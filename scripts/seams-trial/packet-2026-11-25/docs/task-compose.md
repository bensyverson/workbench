# Your leg: the composer

You have two packages, written by two different people who never met: `maze/` (a maze a player walks with a D-pad, picking up coins) and `particles/` (a particle system in a box of pixels). Read them; you may not change them.

Write `workbench.js`, a glue program that uses both, so that **a burst of particles plays where the maze player picks up a coin**, drawn over the maze. Build a maze of your own (any size, with at least three coins) and a particle system whose burst you would want to watch. Show the particles' stage.

Then answer in your report:

1. **The seam.** Which output did you wire to which input, and how did you relate the two packages' frames? Did any check catch a mistake you made?
2. **What did not fit.** Did the two packages' ports meet as they were written, or did something (a field name, a frame, a type, a missing port) stand between them? What would you have needed?
3. **Time.** The maze steps a few times a second and the particles many times. From `seams.md`, can you tell when a burst plays relative to the pickup? What would you want to know?
