# Your leg: the particles author

You wrote `particles/`, a small language for particle systems: emitters that spawn particles, per-particle fields, forces and updates, in a box of pixels. It is a working package: its Dialect, Grammar, UI, examples, refusals and runtime load, check and run, and it already accepts ports from strangers (an Event input that makes a burst, and a value input lambdas read).

Strangers can drive your particles, but not see them: their picture is locked in your own stage. Using `draw.md`, make `particles` **offer its picture** as a `Draw` output, in one of its own frames, so a stranger's part can draw the particles over a page of its own.

A particle system is drawn the way a Canvas sketch draws: a loop over the particles, a shape per particle, sized and colored by what each one carries. Build the list **with a pen** (`pen`), mixing in another kind of builder only where a pen can't say it. You may add to the run's state and change the runtime to fill it (rules.md, R3).

Then answer in your report:

1. **The bridge.** How many lines did your picture take (the port, its builders, colors, images, and any state and runtime you added for it)? Which part was the most work?
2. **The pen and the max.** What max did you declare for the list, and how did you choose it? Did your Programs' own limits fit it? Did you reach for `map` or anything else the docs don't give?
3. **Ops and frames.** Which ops did you use, and which did you consider? How do a particle's fields (its size, its age, its own `.field`s) reach the picture?
4. **Renderers.** What did the Canvas renderer and the Game Boy profile make of your list? Could your particles run on a Game Boy, and what would it take?
