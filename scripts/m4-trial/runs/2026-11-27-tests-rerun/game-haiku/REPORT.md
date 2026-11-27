# REPORT

## Difficulty

3 of 5. The package passes `./check.sh` and all five tests pass, but the player cannot be steered from the keyboard: I could not find in the docs how a Control's keys are declared, so the only steering is the on-screen `buttons` Control, and I have not verified that a person can see or press it.

## What I built

`gridgame`, a grid game package (`gridgame/`):

- **Dialect** (`gridgame.dialect.js`): frames `cell` (grid cells) and `px` (picture pixels, extent from the level); a colour pair; the image `tiles` (`sprites.png`, 32 by 16, cells 16 by 16: cell 0 the figure, cell 1 a gem); run state with `cells` (a list of walls and gems, max 400), `player`, `picked` and `held`; a Draw output `view` (`Draw<1000>@px`, three layers: floor and walls, gems, the player); an Event output `pickup` (`Event<{ at: point2@cell }>`); a value output `picked`; an Event input `steer` (`Event<{ up, down, left, right: bool }>`); a `text(state)` view.
- **Grammar** (`gridgame.grammar.js`): a level is `.row("…")` per row, top row first. `#` wall, `.` floor, `*` gem, `@` start (exactly one). Its `check` refuses an empty level, ragged rows, unknown characters, a missing or doubled start, and more than 400 cells (G001–G005).
- **Runtime** (`gridgame.runtime.js`): `init` builds the cells and player from the rows; `step` walks the player one cell when a direction becomes held (holding does not repeat), refuses walls and off-level cells, and on a gem clears it, adds one to `picked` and pushes one `pickup` record. Clock: tick 1/10 s. `steer` takes up to 48 records per step; `pickup` pushes at most 1.
- **UI** (`gridgame.ui.js`): `stage: { draw: "view" }` and one `buttons` Control `steer` with the four direction buttons. No keys.
- **Example** (`examples/first.js`): a 7 by 5 level, start at (1, 1), gems at (4, 1) and (5, 3), a wall pocket at (2–3, 2).
- **Tests** (manifest): `steer-right-moves`, `steer-held-does-not-repeat`, `steer-into-wall-stays`, `steer-onto-gem-picks-it-up` (state, the `picked` output and the pickup records), `steer-back-over-taken-gem-picks-nothing` (no second pickup, and the gem stays gone). Every Event input (`steer`) and the pickup output are covered.

How a person uses it: press a direction on the page's steering control and the figure walks one cell; gems are picked up and counted; walls stop it. Keyboard steering is not declared (see Gaps).

## Where the docs misled me

- **`docs/kit/define/README.md`, the KIT_VERSION line** says `"0.4"`. `docs/kit/package/README.md` says `"0.5"` (and that a UI with `inputs` no longer loads). I used `"0.5"`; the checker accepted it. The define README is stale.
- **`docs/kit/API.md`, `defineUI`**: `controls: { <input>: { kind, label, <the kind's keys> } }`, with the kind keys "in define/README.md#defineui and the controls draft". `define/README.md` names the kinds but does not give each kind's keys, the `keys` shape, or the record of `buttons`. The controls draft (`docs/project/2026-11-27-controls-draft.md`) is not in the folder. This is the section I could not write.
- **`docs/kit/run/README.md`, "A demand part"**: "steps … when an Event is ready for it". With `clock: { demand: true }` my runtime never moved the player on `steer` records (every move test failed with the player at its start cell). The same runtime with `clock: { tick: 1/10 }` passes all five tests. I did not find the cause. It may be my code or the kit; I did not read the kit's source to check.
- **`docs/kit/API.md`, `spaces`**: I first wrote `spaces: { pure: true }`, which D012 refused. The placeholder is `spaces: { <space>: { pure: true } }`. This was my misreading of the placeholder, not a doc error; I note it so the count of misleads is honest.
- **`./check.sh`, T030** ("the manifest has no tests"): it printed this while my manifest had five tests. It came from the Dialect failing to load (K011), so the tests were never read. The message is wrong in that case; the checker should say the manifest did not load.

## What I guessed

- **`buttons` takes a list of button names**: `buttons: ["up", "down", "left", "right"]`. The U017 message says "buttons that are not identifiers or repeat", which I read as a list of identifiers. The checker accepted it.
- **Control `keys`**: not declared at all (see Gaps).
- **Image op `cell`** is a cell index (`cell: 1`). The Draw table says `cell?` with no type. The checker drew the picture, so it accepted the value, but I did not confirm it means index and not something else.
- **Movement**: one cell per direction that becomes held; holding does not repeat. If several directions start in one record, the order is up, down, left, right, and only one moves.
- **Clock**: tick at 1/10 s, chosen because demand did not work (see above).
- **Picture scale**: I draw in pixels (frame `px`), multiplying cell coordinates by 16 in the builders, rather than relating `cell` and `px` with an edge. I did not read whether `edges` was the intended way.
- **Event input max** 48, from the S116 warning's suggested fix. Without it the checker warns that a page burst could overflow.
- **Error codes** G001–G005: "G" is not in the kit's reserved list (B C D L N P S U V J H K W).
- **State list max** 400 cells and the Draw ceiling 1000. The layers sum to 801, so the ceiling needed to be above that.
- **The `pickup` record** is `{ at: [x, y] }` in `cell` units.

## APIs I fought

- **`defineUI` controls**: the `buttons` Control needed a `buttons` key the docs did not define; the checker's fix said only "add buttons: …". I used the list shape above, after reading the U017 text in `docs/kit/define/codes.js`.
- **Demand clock**: see Where the docs misled me. Changed to tick.
- **S116 sizing**: the checker wanted the `steer` max raised to 48; I raised it.
- **`hash.sh`** rewrites `wb-package.json` with pretty-printed JSON, so the manifest was reformatted after my first hash. Harmless.

## Gaps

1. **Control keys.** I needed to bind keyboard keys to the steering directions (e.g. arrow keys). The docs say a Control's keys and each kind's keys and record are in `docs/project/2026-11-27-controls-draft.md`, which is not in the folder, and `define/README.md#defineui` does not list them. Smallest change: put the kind table (each kind's keys, record and the `keys` shape, incl. `buttons`'s value) in `define/README.md` or ship the controls draft.
2. **Clear statement of demand-part stepping on Event inputs.** I needed to know why `demand` did not step on `steer` records. Smallest change: a sentence in `run/README.md` on when a demand part steps on Event inputs, or a passing example.
3. **Draw op field types.** I needed the type of `image`'s `cell` (index or pair). Smallest change: one line in `draw/README.md`'s op table giving each field's type.
4. **The `buttons` value shape** (see Guessed).

## Tests

- **How hard**: moderate. The manifest form is clear and the examples fit it; each test took one or two tries, and most of the friction was the one demand-clock failure, which made all moves fail at once.
- **Where the draft misled or left me guessing**: the `T030` message said "no tests" when the Dialect had not loaded (see above). The `expect` form `{ events, from, to, count }` is documented, but I could not tell from the docs whether `count: 0` is valid; it passed, so it is.
- **What I wanted to test and the tests cannot say**:
  - That a bad level is refused (G001–G005). A manifest `refusals` entry could do it with its own module; I did not write one, to keep the package to the task.
  - The picture at an instant (which gems are drawn). The draft parks "a Draw output's list at an instant"; I tested the state behind the picture instead.
  - "Holding is not a repeat" needs an identical record, which the page would not send; the test sends one anyway.

## Docs I could not reach

- `docs/project/2026-11-27-controls-draft.md` is linked from `docs/kit/API.md` (`defineUI`) and `docs/kit/define/README.md` (Declared Controls). It is not in the folder. This is the gap behind Gaps 1 and 4.
- Draft documents named in the kit pages and absent from `docs/project/`: `2026-11-26-draw-list-draft.md`, `2026-11-25-seams-draft.md`, the clocks draft (linked from `define/README.md`) and the tests dogfood / M4 trial findings (linked from `package/README.md`).
- Links that leave `docs/` (not followed, per R1): `../../scripts/define-trial/docs/api-draft.md`, `../../scripts/define-trial/docs/api-effects.md`, `../../scripts/ui-trial/docs/ui-draft.md` and the `scripts/` checkers.
- I did not read `docs/kit/compose/README.md`: I was the author, not the composer.

## Checker runs

Five runs of `./check.sh gridgame`, plus `./hash.sh` before each:

1. K011 `gridgame.dialect.js` failed to import (D012, `spaces.pure`); T030 "no tests" (false, see above).
2. K011 `gridgame.ui.js` failed to import (U017, `buttons` needs `buttons`); T030 again.
3. H006 on all five tests (the player never moves under `clock: demand`); T010 "playing each of your Controls changed nothing in the picture".
4. Clock changed to tick: `tests: 5 of 5 passed`; S116 warning (`steer` could hold 48 records per step, max 16).
5. Steer max raised to 48: `tests: 5 of 5 passed`, `gridgame: no violations`, exit 0.
