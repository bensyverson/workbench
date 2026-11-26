# Your leg: the swarm author

You wrote `swarm/`, a small language for a swarm on open ground: groups of agents, each placed around its group's home, each steering by the Program's named `.steer` rules and its `update`, never seeing each other. A Program also declares numbers every agent carries of its own (`.trait`), which its lambdas read and change. It is a working package: its Dialect, Grammar, UI and examples load and check. It has never run: nobody has written its runtime.

People are starting to use packages together in one workbench, with other languages you will never see: a game, a physics toy, a music sequencer. Make `swarm` useful to them. Using `seams.md` and `runtime.md`:

- add the **inputs** and **frames** a stranger would want, to drive your swarm from something that happens elsewhere. Accept at least one `Event` input that draws agents toward the position in its record (a call, a lure, a scent), and let a Program's lambdas have a say in how its agents answer it;
- write the swarm's **runtime**: agents start around their group's home; each step, every `.steer` runs on every agent, then `update`; agents move by their velocity, capped at their group's speed, and stay on the ground; an Event input's records draw them as you decide. Each agent's traits start at their declared values and keep what the lambdas leave in them, from step to step.

Then answer in your report:

1. **What you accepted.** Which inputs did you add, and which did you consider and leave out? Why? What did you name each record's fields, and why those names? Did you give any field a default?
2. **The Program's own data.** Where do an agent's traits live while the run goes on? How did you find out how to keep them, and was `runtime.md` enough?
3. **Records and lambdas.** Does a lambda read an Event's record, or only your runtime? What did `record: { name, slots }` let you do, and how did you handle a step with no record? How did you call the `.steer` lambdas by name?
4. **Time.** When does a record arrive relative to the step that sent it? Did you use `$T`, the kit's `s`, a rate or `delivery`?
5. **The runtime.** What did `runtime.md` leave you to guess? What did the checker's run catch?
