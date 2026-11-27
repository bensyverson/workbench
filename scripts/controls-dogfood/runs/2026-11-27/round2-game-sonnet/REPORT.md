# Report

## Difficulty
2. The Controls themselves map directly onto the `buttons` kind; the work around them (screen layout, hand-in form, the second part's picture) needed guesses.

## What I built
- `dialect.js`: two Event inputs, `move` (up, down, left, right as bools) and `act` (jump, fire as bools), and the Draw output `board`.
- `ui.js`: two `buttons` Controls named after those inputs. `move` has a 3 by 3 `grid` for the cross, arrows plus WASD (two codes per button), and gamepad D-pad indices. `act` has jump on `KeyJ` and fire on `KeyK`. A tile `play` below the stage puts the two Controls side by side in a `row`, because the reference says that is how a pad and two buttons sit beside each other.
- Two Controls rather than one, since a `grid` lays out only its own Control's buttons.
- Keys: I avoided `Space` (Space with a drag pans the stage) and `KeyR` (score's reset; sharing it would raise S121).
- `preset-lines.js`: `examplePreset("game", game, build, { ui })`, with no wire lines.
- `glue-lines.js`: three wires (`move`, `act` into `game`; `reset` into `score`) and a `.show` that layers score's picture over the board.
- `preset-lines.js` and `glue-lines.js` default-export a function that takes the kit's names, so that they import under Node. Nothing in them has been run or checked beyond import; the kit does not exist.

## Where the docs misled me
Nothing proved wrong, since nothing runs. Places that can be read wrongly:
- The adapter table lists `gamepad: { <button>: <index> }` and `gamepad: { axis: <index> }` together for "buttons, number". It reads as if `buttons` might take `axis`, but nothing says which button an axis would press. I took `axis` to be for `number` only.
- Section 9 says the generated `controls` view already shows Controls "in a row that wraps", and also that a tile's `row` puts them side by side. It does not say whether a Control placed in a tile still appears in `controls`, so my layout may show each Control twice.
- The last section's skeleton uses `page`, `compose` and `$` without saying where they come from, and shows one `.part` only.

## What I guessed
- D-pad index order: 12 up, 13 down, 14 left, 15 right. The reference says only that 12 to 15 are the directions; the order is from my knowledge of the browser standard layout.
- `tiles` is a top-level key of the `defineUI` declaration, beside `controls` and `stage`. Section 9 shows the `tiles:` object but not where it goes.
- `place: { splitBelow: "stage" }` and the tile's title. The task only asks that the buttons sit beside the pad.
- `null` may appear several times in a `grid` (only a repeated button is listed as U017).
- Score's Draw output is called `picture`. The task does not name it, and a wrong name would break `.show`.
- Layer order in `.show`: I assumed the later output is drawn on top (`game` is the bottom). The reference says outputs are layered but not in which order.
- The composition's name, `game-with-score`, and a second `.part(score)` call.
- The `ui` passed to `examplePreset` is `defineUI`'s result for the declaration in `ui.js`, not the plain object. The builder argument to `defineUI` is not part of this task.
- The `name` and `fn` arguments of `examplePreset` are `"game"` and `game`; the reference does not explain them.
- The `tiles` of a part still apply when it is composed with another. The reference does not say how two parts' tiles or Controls are arranged.

## Gaps
- **A consumer's max.** Folding and the promise that a tap's press and release both arrive depend on "the consumer's max", but the reference never says how an Event input declares it or what the default is. At a max of 1, "the first max − 1 records, then the latest" keeps only the release, so a quick jump or fire tap would be lost. Smallest change: state the default, and show the syntax for setting it on an input.
- **Gamepad stick.** A pad played "from a gamepad" can only use button indices, so the analog stick cannot move the creature. Smallest change: something like `gamepad: { axes: [<x>, <y>] }` for a four-button Control, with a stated threshold.
- **Side by side without a tile.** A UI cannot say that two Controls sit together in the generated `controls` view, or hide that view when a tile replaces it. Smallest change: say that a Control placed in a tile leaves the `controls` view.
- **Hand-in form.** No import paths are given for `examplePreset`, `compose`, `page` or `defineUI`, so the line files cannot be real standalone modules. Smallest change: one complete preset file and glue file with their imports.

## Docs I could not reach
None needed beyond the three files. The reference mentions other documents (the compose documentation, kit/define's README); I did not read them. The compose documentation might settle the `.show` order and where `page` comes from.
