# Report

## 1. Difficulty
2 out of 5: the Control declaration follows directly from the kind table, but the reference cannot say how to show two parts' pictures, and says too little about screen placement and the preset call.

## 2. What I built
- **`dialect.js`:** one Event input, `play`, with six bools, and the Draw output `board`.
- **`ui.js`:** one `buttons` Control, `play`, holding the pad and both buttons. `grid` draws the cross, leaves an empty column, and puts jump and fire beside it. `grid` is the only documented way to fix on-screen positions, which is why this is one Control and not two. The cost is that the directions and the actions share one record and one `perFrame`.
- **Keys:** arrows and WASD for the pad, J for jump, K for fire. I avoided Space because Space with a drag pans the stage (requirement 10), and R because `score` uses it.
- **Gamepad:** only the four directions, as the task asks.
- **`perFrame: 12`:** with six buttons in one record stream, the default of 2 could fold away a quick tap that lands in the same frame as direction changes.
- **`preset-lines.js`:** a function that takes the host's names and calls `examplePreset("game", game, build, { ui, wirePage })`. It is a function so that the module imports under Node without a kit.
- **`glue-lines.js`:** a function that adds two wires (`play` to `game`, `reset` to `score`) and shows `game.out.board`. **It does not meet "shows both parts' pictures"** (see Gaps).
- **Checks:** I imported all four modules under Node and called the two functions with stand-in objects. That checks syntax and the calls made, not anything against the kit, which has no checker.

## 3. Where the docs misled me
Nothing I can show to be wrong, since nothing runs. Two places invite a wrong reading:
- Requirement 9 says splits use "the existing split directions" and shows `place: { tabWith }`, but gives neither the directions nor where `place` is written. It reads as if side-by-side placement can be declared, and from this document it cannot.
- Requirement 5 speaks of "a shown layer" with a bottom producer, so showing several pictures evidently exists, but the glue skeleton shows `.show` with one output.

## 4. What I guessed
- **Gamepad indices:** 12, 13, 14, 15 for up, down, left, right. These come from my knowledge of the browser's "standard" gamepad mapping; the reference only says `<index>`.
- **Partial maps:** `gamepad` may name only some of a Control's buttons.
- **Two keys on one button:** the list means either key holds it. What happens when both are held and one is released is not said.
- **Held buttons:** a record is sent on each change, not every frame, so the game's runtime must keep the held state itself.
- **`examplePreset`:** `name` is a free string, `fn` is the game's function (`game`), and `ui` is the plain declaration rather than what `defineUI` returns. `wirePage` appears in the signature and is never explained, so I pass it through untouched.
- **`page`:** the skeleton uses it without saying where it comes from, so `glue-lines.js` takes it as an argument.
- **`perFrame` and the consumer's max:** I assumed raising the Control's `perFrame` is enough. Folding is described in terms of the consumer's max, and the reference does not say how an input sets it.

## 5. Gaps
- **Showing both parts' pictures.** Needed: show `game.out.board` and `score`'s picture together. The reference gives only `.show(<part>.out.<output>)`. The task also does not name `score`'s Draw output. Smallest change: document the multi-picture form (for example, whether `.show` takes several outputs, and whether they layer or sit side by side) in "Wiring a page Control", and name `score`'s output in the task. Until then `score`'s picture is missing from `glue-lines.js`.
- **Placing one Control beside another.** Needed: jump and fire beside the pad as their own Control. Smallest change: document the `place` and tile syntax, with a side-by-side example using `{ kind: "control" }`.
- **The preset call.** Needed: what `wirePage` is, what `fn` and `build` are, and where `examplePreset` is imported from. Smallest change: one complete preset example.
- **Keys across parts (not needed here).** S119 covers two Controls with one name, but nothing says what happens when two differently named Controls in a composition bind the same key code. Smallest change: one sentence giving the rule or a code.

## 6. Docs I could not reach
None that I needed to open. The reference mentions the compose documentation, which is not in the folder; it might settle the `.show` question.
