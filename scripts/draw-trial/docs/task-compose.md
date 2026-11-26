# Your leg: the composer

You have two packages, written by two different people who never met: `maze/` (a maze a player walks with a D-pad, picking up coins) and `particles/` (a particle system in a box of pixels). Each has a runtime, and each now offers its picture as a `Draw` output. Read the packages; you may not change them.

Build a small arcade page in which **a burst of particles plays over the maze where the player picks up a coin, with a HUD**:

- Write a **root package** of your own (a new folder named as its package, written with `api.md`, `packaging.md` and `runtime.md`): a Dialect whose `Draw` inputs take the two pictures, and whose `Draw` output layers them with a HUD that shows at least one thing from the run as `text` (the score, coins left, the time: your choice). Give it a Grammar, at least one example, and a runtime.
- Write **`workbench.js`**, a glue program that builds a maze of your own (any size, with at least three coins) whose player walks one cell per step in the direction the D-pad holds, a particle system whose burst you would want to watch, and one root part; wires the pickup to the burst and both pictures into the root; relates the frames; and **shows the root**.

The checker plays your workbench: it holds the D-pad toward the nearest coin and watches the root's list for the burst.

Then answer in your report:

1. **The layering.** How did your root combine the two pictures and the HUD, and in which order? How many lines did the root's picture take? Did you reach for `map` or anything else the docs don't give?
2. **Frames.** How did you relate the maze's frame, the particles' frame and your root's? Did the two pictures line up on your root's screen? Did any check or the run catch a mistake?
3. **What did not fit.** Did the two packages' pictures meet your root as they were written, or did something (a frame, a max, a color, an image, a missing port) stand between them? What would you have needed?
4. **Renderers.** What did the Canvas renderer and the Game Boy profile make of your root's list? Could your page run on a Game Boy, and what would it take?
