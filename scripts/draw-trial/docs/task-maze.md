# Your leg: the maze author

You wrote `maze/`, a small language for a maze a player walks with a D-pad, picking up coins (`#` a wall, `c` a coin, `.` floor). It is a working package: its Dialect, Grammar, UI, examples and runtime load, check and run, and it already offers ports to strangers (an Event when a coin is picked up, the player's cell, the score).

Strangers can see what happens in a maze, but not what it looks like: its picture is locked in its own stage. Using `draw.md`, make `maze` **offer its picture** as a `Draw` output, in one of its own frames, so a stranger's part can draw the maze inside a page of its own.

A maze is a world of things in cells: walls, coins, the player. Build the list the way an engine of entities would, **one op per item** (`each`), mixing in a whole-list or pen layer only where one op per item can't say it. You may add to the run's state and change the runtime to fill it (rules.md, R3).

Then answer in your report:

1. **The bridge.** How many lines did your picture take (the port, its builders, colors, images, and any state and runtime you added for it)? Which part was the most work?
2. **One op per item.** Did `each` fit the maze as its state was? What did you add to the state, and why? Did you reach for `map`, an index, or anything else the docs don't give?
3. **Ops and frames.** Which ops did you use, and which did you consider? Is your picture right in your own frame, at your frame's scale? Would a stranger who stretches your frame onto theirs see it right?
4. **Renderers.** What did the Canvas renderer and the Game Boy profile make of your list? Could your maze run on a Game Boy, and what would it take?
