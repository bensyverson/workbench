# The task: package two languages

You have the parts of two small domain languages, loose in two folders. Each one works: its Dialect, Grammar and UI load and check. Turn each into a Dialect package, as `packaging.md` describes, under `out/`:

- `out/particles/`, from `particles/`: a particle system language (emitters, fields, forces). Its folder holds the Dialect, the Grammar, a UI with one custom element (`particles-field.js`), and the `examples/` folder. That folder holds **two kinds of example**. `01.js` to `06.js` are Programs the Grammar accepts. `r01.js` to `r06.js` are **refusals**: Programs written to be refused, each showing one mistake the Grammar must catch.
- `out/maze/`, from `maze/`: a maze an actor walks with a D-pad, given its Dialect, Grammar, UI and examples.

Copy the files you need into each package and lay them out as you think best. You may move a file and change its imports to match. Don't change what any definition says.

Then answer these in your report:

1. **Refusals.** How did you handle the particles refusal examples? Does the manifest have a place for them? If not, what would you want?
2. **Two packages together.** Someone wants to use both packages in one workbench, so that a particle burst plays where the maze actor reaches the goal. From what `packaging.md` says, what would they write, and where? What does the format leave them unable to say?
3. **An upload.** A viewer uploads your `out/maze/` folder into a page. What would they see if one file changed after you hashed it? Is that what you would want?
