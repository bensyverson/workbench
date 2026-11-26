# Your leg: the maze author

You wrote `maze/`, a small language for a maze a player walks with a D-pad, picking up coins (`#` a wall, `c` a coin, `.` floor). It is a working package: its Dialect, Grammar, UI and one example load and check.

People are starting to use packages together in one workbench, with other languages you will never see: a sound language, a lighting effect, a scoreboard, a camera. Make `maze` useful to them. Using `seams.md`, add the **outputs** and **frames** a stranger would want to react to what happens in a maze and to where things are in it. Offer at least one `Event` output. Describe how your host fills anything new in the run's state, in comments where the host is described today.

Then answer in your report:

1. **What you offered.** Which outputs did you add, and which did you consider and leave out? Why?
2. **Frames.** How would a stranger know where a cell is in their own space? Is what `seams.md` lets you say enough?
3. **The host.** What must the maze's host now do that it did not before? Is that clear from `seams.md`?
