# Your leg: the particles author

You wrote `particles/`, a small language for particle systems: emitters that spawn particles, per-particle fields, forces and updates, in a box of pixels. It is a working package: its Dialect, Grammar, UI, examples and refusals load and check.

People are starting to use packages together in one workbench, with other languages you will never see: a game, a level editor, a music sequencer. Make `particles` useful to them. Using `seams.md`, add the **inputs** and **frames** a stranger would want to drive your particles from something that happens elsewhere. Accept at least one `Event` input that makes particles appear, and at least one value input that a lambda reads. Change the Grammar so a Program can say which emitters an input drives, and describe what your host does with each input in comments where the host is described today.

Then answer in your report:

1. **What you accepted.** Which inputs did you add, and which did you consider and leave out? Why?
2. **Frames.** How would a stranger know how their positions map onto your box? Is what `seams.md` lets you say enough?
3. **The host.** What must the particles host now do that it did not before? Is that clear from `seams.md`?
