# Your leg: the particles author

You wrote `particles/`, a small language for particle systems: emitters that spawn particles, per-particle fields, forces and updates, in a box of pixels. It is a working package: its Dialect, Grammar, UI, examples and refusals load and check. It has never run: nobody has written its runtime.

People are starting to use packages together in one workbench, with other languages you will never see: a game, a level editor, a music sequencer. Make `particles` useful to them. Using `seams.md` and `runtime.md`:

- add the **inputs** and **frames** a stranger would want, to drive your particles from something that happens elsewhere. Accept at least one `Event` input that makes particles appear, and at least one value input that a lambda reads. Change the Grammar so a Program can say which emitters an input drives;
- write the particles' **runtime**: each step, particles age, move and die; emitters spawn by their rate; the Program's `spawn`, `force` and `update` lambdas run on each particle; and an emitter driven by an Event input makes particles when a record arrives.

Then answer in your report:

1. **What you accepted.** Which inputs did you add, and which did you consider and leave out? Why? What did you name each record's fields, and why those names?
2. **Frames.** How would a stranger know how their positions map onto your box? Is what `seams.md` lets you say enough?
3. **Records and lambdas.** Does a lambda read an Event's record, or only your runtime? Why? What did `record: { name, slots }` let you do, or not?
4. **Time and rates.** Did you use the kit's `s`, a rate (`/s`) or `delivery`? Could you tell from `runtime.md` when a record arrives relative to the step that sent it?
5. **The runtime.** What did `runtime.md` leave you to guess: calling the lambdas, the particle object, `kill`, counters, the Event max? What did the checker's run catch?
