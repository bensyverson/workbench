# Your leg: the composer

You have two packages, written by two different people who never met: `bounce/` (balls that fly in a box and rebound off its walls) and `swarm/` (groups of agents on open ground, steering by their Program's rules). Each has a runtime. `reference.md` lists both packages' ports and frames, generated from their Dialects. Read the packages; you may not change them.

Write `workbench.js`, a glue program that uses both, so that **the swarm's agents rush to where a ball meets a wall**. Build a box of your own with at least two balls, and a swarm you would want to watch answer them. Show the swarm's stage. The checker plays your workbench for a few seconds and watches the agents near each point where a ball met a wall.

Then answer in your report:

1. **The seam.** Which output did you wire to which input, and how did you relate the two packages' frames? Did any check or the run catch a mistake you made?
2. **What did not fit.** Did the two packages' ports meet as they were written, or did something (a field name, a frame, a type, a missing port, a queue's size) stand between them? Did you use `rename`, `delay` or `overflow`? Did a default fill a field? What would you have needed?
3. **Time.** The two parts may step at different rates. From `runtime.md`, can you tell when the agents hear of a rebound relative to the step that made it? Was the run's answer the one you expected?
