# Your leg: the maze author

You wrote `maze/`, a small language for a maze a player walks with a D-pad, picking up coins (`#` a wall, `c` a coin, `.` floor). It is a working package: its Dialect, Grammar, UI and one example load and check. It has never run: nobody has written its runtime.

People are starting to use packages together in one workbench, with other languages you will never see: a sound language, a lighting effect, a scoreboard, a camera. Make `maze` useful to them. Using `seams.md` and `runtime.md`:

- add the **outputs** and **frames** a stranger would want, to react to what happens in a maze and to where things are in it. Offer at least one `Event` output;
- write the maze's **runtime**: each step, the Program's `control` lambda sets the player's intent from the D-pad, the player walks, stopping at walls, and picks up each coin it enters. Push your Event records from it.

Then answer in your report:

1. **What you offered.** Which outputs did you add, and which did you consider and leave out? Why? What did you name each record's fields, and why those names?
2. **Frames.** How would a stranger know where a cell is in their own space? Is what `seams.md` lets you say enough?
3. **Time.** When does a stranger's language see a coin you picked up, relative to the step that picked it? Could you tell from `runtime.md`? Did you use the kit's `s` anywhere, and if not, why not?
4. **The runtime.** What did `runtime.md` leave you to guess: the D-pad, the state, the Event max, calling `control`? What did the checker's run catch?
