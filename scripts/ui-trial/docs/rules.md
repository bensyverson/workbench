# Trial rules: write the UI for two packages with the draft UI API

*2026-11-25, second UI trial (the state moved into the Dialect). You have three documents: these rules, `ui-draft.md` (the UI API, a draft that is **not built**) and `task.md` (the two packages and what their UIs must show). Each package's folder also holds its Dialect and Grammar. You add one key to each Dialect, its `state` (and the `kit/define` names it uses, such as `struct` and `list`, to its import); you change nothing else in them.*

## The task

Declare each package's state in its Dialect, then write one UI declaration per package, `particles/particles.ui.js` and `maze/maze.ui.js`, with `defineUI` as `ui-draft.md` describes it, covering what `task.md` asks for as far as the draft goes. Where the draft cannot say something, do not invent API and do not work around it: write down what you needed. A gap you report is worth as much as a declaration that checks.

## What you hand in

| File | What |
|---|---|
| `particles/particles.dialect.js` | the Dialect as given, with your `state` added |
| `maze/maze.dialect.js` | the same, for maze |
| `particles/particles.ui.js` | `export const particlesUI = defineUI(particles, { … })` |
| `particles/<tag>.js` | each custom element module your particles UI names (`task.md` asks for one) |
| `maze/maze.ui.js` | `export const mazeUI = defineUI(maze, { … })` |
| `maze/<tag>.js` | each custom element module your maze UI names, if any |
| `REPORT.md` | your report (rule R10) |

Leave `*.grammar.js`, `examples/` and the rest of each Dialect as they are.

If the tool you write files with refuses to write `REPORT.md`, write it from the shell with a heredoc instead (`cat > REPORT.md <<'EOF'` … `EOF`). Do not return the report as text in place of the file.

## The rules

Each rule names the codes that enforce it. Run the checker as often as you like (`check.sh` checks both packages). It loads your Dialect, Grammar and UI files with the real `kit/define`, whose `defineDialect` and `defineUI` refuse what `ui-draft.md` refuses. It prints each problem as `<file>:<line>: <code> <message>` and a `fix:` line.

- **R1. Imports.** A UI file imports only from `kit/define` and the package's own files (its Grammar). An element module imports nothing. (C006; the element module is read by hand)
- **R2. One declaration.** The UI file calls `defineUI` once, with the package's own Grammar builder, and exports the result. The Dialect has `text(state)`. (C001, U013, LOAD)
- **R3. The state is declared in the Dialect**, as `state` beside `text`, in the Dialect's types, and matches what `text(state)` reads (its comment says what `state` holds). (LOAD with `defineDialect`'s D code; U013 when it is missing; the match is read by hand)
- **R4. Every path and every read resolves.** A path names a part of `state` of the type its key takes; a lambda reads only declared members of `s` (and of a table's `row`), and no free name but its parameters, its locals and the Dialect's globals, intrinsics, library and vector types. (U005, U007)
- **R5. Lambdas are pure Runtime Lambdas:** an arrow in the Runtime Subset, no more parameters than the convention, assigning only its own `let` locals. (U007)
- **R6. Tiles and components are well formed:** known keys, required keys present, known kinds, values of the right form, ids that are identifiers and not generated views' ids, each tile placed in exactly one direction against a view or tile that exists, with no cycle. (U001, U002, U003, U004, U011, U012)
- **R7. Custom elements keep the contract.** The tag is `<package>-<name>`; `module` is a package file that defines that tag; `emits` names only `pick`, `select`, `param`. The element takes `state`, `params`, `text` (and `value` on a component) as properties and dispatches only the `wb-` events it declares, with `bubbles` and `composed`; it never handles keys for inputs or calls `focus()`. (U008, U009; the module's behavior is read by hand)
- **R8. Inputs are declared events.** `inputs.object` names the Dialect object the lambdas read the buttons from; its members are exactly the buttons, each `"bool"`; roles come from the draft's list, each once. (U010)
- **R9. Nothing outside the draft.** No key, kind, view, event or role `ui-draft.md` does not name; no styling, no layout but `row` and `col` and `place`; no change to the Dialect or Grammar; no other files. Where the task needs one, report it as a gap. (U001, U002; the rest is read by hand)
- **R10. The report.** `REPORT.md` has these sections, in order:
  1. **Difficulty**, 1 (easy) to 5 (could not do it), with one sentence why.
  2. **Per item**: one line for each numbered item of `task.md`: fits, partly fits (what did not), or not expressed (why).
  3. **Where the draft misled you**: a rule or example in `ui-draft.md` that led you wrong, quoted.
  4. **What you guessed**: every place the draft did not say and you chose; what you chose.
  5. **Gaps**: what you needed and the draft does not have, smallest first, each with the task item that needs it.
  6. **The element contract**: did properties in and `wb-` events out suffice for the elements you wrote? What did you want to pass or send that you could not?
  7. **Two packages**: `task.md`'s composition question, answered in prose.
  8. **Files**: every file you opened, and confirm you opened nothing else.

## Codes

### The draft's (`U…`)

| Code | Refused when |
|---|---|
| U001 | an unknown key (with a did-you-mean), or a required key missing |
| U002 | a component `kind` that does not exist |
| U003 | a `place` or `annotate` that names no view or tile (or is qualified with any package's name, your own included, in this one-package trial), or tiles placed in a cycle |
| U004 | a `place` without exactly one direction, or a `size` outside 0.1 to 0.9 or beside `tabWith` |
| U005 | a path that names nothing in `state`, reads into a list, or names the wrong type for its key; a table column that is not a key of its rows; a `traces` annotation on something that is not a number |
| U007 | a lambda that does not parse as one arrow, leaves the Runtime Subset, takes more parameters than its convention, assigns anything but its own `let` locals, reads a member of the state or row that is not declared, uses the state whole, or reads a free name the Dialect does not give |
| U008 | a custom element tag without the package prefix or not a valid tag, without a `module`, with a module that is not a package file, does not exist or does not call `customElements.define` for the tag, or one tag used twice |
| U009 | an `emits` event that is not `pick`, `select` or `param`, or `emits` without an `element` |
| U010 | `inputs` whose `object` is not a Dialect object, whose buttons are not exactly its members or not each `"bool"`, or with an unknown or repeated `role` |
| U011 | a tile id that is not an identifier or is a generated view's id |
| U012 | a value of the wrong form: a `label`, `title`, `unit`, `note` or button `label` that is not a string; `limit` or `steps` out of range or not whole; a `window` or `seconds` of 0 or less, or `seconds` over 3600; `from` not below `to`; a `columns` entry that is neither a key nor `{ label, value }`; an empty `body`, `items` or `columns` |
| U013 | `defineUI` given something other than the package's Grammar builder, or a Dialect that declares no `state` |

### The checker's own

| Code | Refused when |
|---|---|
| C001 | the UI file does not call `defineUI` exactly once |
| C006 | a UI file imports something other than `kit/define` and the package's own files |
| LOAD | the UI file (or the Grammar it imports) cannot be loaded: a syntax error, an exception |

Fix a Dialect that does not load first: until `defineDialect` accepts your `state`, no UI file can be checked.

The checker does not run a host: nothing is drawn, no element is loaded, and a lambda's result type is not checked (only what it reads and writes). Whether the state matches `text(state)`, and what an element module does, are read by hand.
