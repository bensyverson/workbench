# Your task: the controls of a grid game

You are writing, on paper, the controls of a small grid game for a kit whose controls API is described in `reference.md` (a draft: nothing in it runs, and there is no checker). Use only what `reference.md` says.

**The game.** A creature moves on a 12 by 10 grid. The person holds a direction to move it, and has two buttons: one makes it jump, one makes it fire. The game's Dialect (its domain language) takes the person's input as Event inputs that you name and declare yourself; its picture is a Draw output named `board`.

**Write:**

1. `dialect.js`: `export const ports = { in: { ... }, out: { board: { seam: "Draw", note: "..." } } };`. Declare the Event inputs the game needs, each with a `seam` and a `note`.
2. `ui.js`: `export const ui = { controls: { ... }, stage: { draw: "board" } };`, the declaration that would be passed to `defineUI`. The four directions are a pad: laid out as a cross on screen, played from the arrow keys and from W, A, S and D, and from a gamepad. The two buttons are played from the keyboard (pick two keys) and sit beside the pad on screen.
3. `preset-lines.js`: the call that makes the game part's preset when the part is run alone, with the lines it needs to play the controls (the placeholder in the reference is enough; use `<game>`-style names such as `game` and `build`).
4. `glue-lines.js`: the lines of a glue that composes the game part (`game`) with a second part, `score`. The `score` part's package declares one Control, which you do not write:

```js
// score's dialect.js:  ports.in.reset = { seam: "Event<{ reset: bool }>", note: "zero the score" }
// score's ui.js:       controls: { reset: { kind: "buttons", buttons: ["reset"], keys: { reset: ["KeyR"] } } }
```

   The glue wires every Control the person plays into the part that takes it and shows both parts' pictures. Write the `.wire(...)` calls and the `.show(...)` line only (the skeleton in `reference.md`'s last section is enough).

Then write `REPORT.md` as `rules.md` says. Where `reference.md` is unclear, wrong, or cannot say what you need, that is the most useful thing you can report.

**Reading the documents.** Read long documents with your file-reading tool, by offset and limit, not with `cat`.
