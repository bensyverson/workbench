# Report

## Difficulty
**2**: the docs covered everything the game needed and the first check passed; the work was reading a lot of reference to find the few parts that applied.

## What I built
`gemmaze/`, a grid game package.

- A Program is one level: `gemmaze("<name>").map([...rows])`, with `#` wall, `.` floor, `*` gem, `@` player start (exactly one). Rows must be equal length, at most 400 cells; outside the grid blocks like a wall. Mistakes are `M001`.
- Input `pad` (the page pad's seam). A newly held direction moves one cell at once; holding repeats every 6 ticks (0.2 s at a 1/30 s tick). With several held, the newest press leads.
- Outputs: `picked` (Event `{ at: point2@cell, collected: f64 }`, `at` the cell's center), `collected` (f64), `view` (Draw in `px`, 16 px per cell; an edge relates `cell` to `px`).
- The UI shows `view` plus gems picked up and left. `sprites.png` is a declared image.
- One example (`examples/garden.js`), one refusal (`refusals/two-starts.js`), three tests.

To use it, load the package in the workbench, wire `page.out.pad` to the part's `in.pad`, show the part, and steer with the D-pad.

## Where the docs misled me
- `START.md` step 6 and the task say the check runs manifest tests, while `package/README.md` ("Draft, not built") says `checkManifest` refuses the `tests` key with K002. The task explained the stand-in, so it cost nothing, but the package README's manifest table and START disagree if read alone.
- Nothing else turned out wrong in the parts I used.

## What I guessed
- Movement on holding (task left it to me), the repeat interval, and what happens with several directions held.
- Pickup record: cell frame, cell center, running total.
- `slots: {}` is acceptable for a Dialect with no lambdas (API.md marks `slots` required and shows only non-empty ones). It was accepted.
- Walls and gems go in the run state as lists, so Draw `each` layers can read them; the docs note a string has no `length`, so I did not try to draw from `record.map`.
- A `tick` consumer's pad max: 16, from compose/README's "2 for each frame of at most 1/240 s its period can hold".
- `events.out.picked` = 16: at most one move per input record, or one repeat move in a step with no new press.
- A tap that arrives as press and release in one step still moves once, because I process every record in order.
- `M` as my diagnostic letter.

## APIs I fought
None made me rewrite anything. (My one rework was my own: a `sed` edit of the manifest missed after `hash.sh` had reformatted it.)

## Gaps
- A test cannot expect a value output (`collected`); I checked the state field it reads from instead. The draft says this itself. Smallest change: an expectation `{ "at": <s>, "output": "<name>", "value": … }`.
- A test cannot expect anything about the Draw output, so nothing tests that a picked-up gem leaves the picture or that the player is drawn in the right cell. Smallest change: an expectation on a Draw output's list at an instant (or "contains this op").

## Tests
- **How hard:** easy. All three passed on the first run, and the draft's form, state paths and `events` expectations were enough to write them without guessing. The draft's worked game example was close to my case.
- **Misled or guessing:** only the "not built" wording above. I relied on the stated defaults (`from`/`to` covering the whole run) and on a vector comparing as an array.
- **Verbosity:** the pad's fields have no defaults (its seam must match the page's exactly), so every record spells out all four, and a tap is two records.
- **Easy to write a weak test:** "walls block" is an expectation that nothing changed, which also passes if the input is ignored. My first version had that flaw; I added a later move that must succeed. I did not check any test by breaking the runtime to see it fail.
- **Cannot say:** value outputs and the picture (see Gaps). A test also cannot supply its own small level; it must use a listed example, so a case needing a special layout means adding an example for it.
- **Covered:** the one Event input (`pad`): tap, hold-repeat, walls; the Event output `picked`: exact records, and a count of 0. Not covered: the grid's outer edge, several directions held at once.

## Docs I could not reach
None needed. I did not follow links pointing outside `docs/`.

## Checker runs
4 runs of `./check.sh`, no diagnostic codes in any; each reported all 3 tests passing and no violations.
