# Your leg: the bounce author

You wrote `bounce/`, a small language for balls in a box: each ball flies, its Program's `drift` lambda changes its velocity as it flies, and it rebounds off the box's four walls, where the Program's `rebound` lambda runs. A Program also declares numbers every ball carries of its own (`.prop`), which its lambdas read and change. It is a working package: its Dialect, Grammar, UI and one example load and check. It has never run: nobody has written its runtime.

People are starting to use packages together in one workbench, with other languages you will never see: a sound language, a lighting effect, a scoreboard, a crowd. Make `bounce` useful to them. Using `seams.md` and `runtime.md`:

- add the **outputs** and **frames** a stranger would want, to react to what happens in the box and to where things are in it. Offer at least one `Event` output that pushes a record each time a ball meets a wall, with the point where it met it;
- write the bounce **runtime**: each step, every ball runs `drift`, moves by its velocity, and when it meets a wall turns back off it and runs `rebound`. Each ball's props start at their declared values and keep what the lambdas leave in them, from step to step.

Then answer in your report:

1. **What you offered.** Which outputs did you add, and which did you consider and leave out? Why? What did you name each record's fields, and why those names?
2. **The Program's own data.** Where do a ball's props live while the run goes on? How did you find out how to keep them, and was `runtime.md` enough? Could a stranger read them?
3. **Frames and time.** How would a stranger know where a point in your box is in their own space? When does a stranger's language see a rebound, relative to the step that made it?
4. **The runtime.** What did `runtime.md` leave you to guess: calling the lambdas, the ball object, the Event max, the state? What did the checker's run catch?
