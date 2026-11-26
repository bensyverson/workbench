# REPORT: maze author

## 1. Difficulty

3. The ports and frames were easy to write from `seams.md`; the hard part was deciding what a stranger can act on and what the host must do, when the draft gives no place to state host duties except prose comments.

## 2. What you did

**Package:** `maze` 0.1.0 → 0.2.0 (`wb-package.json`). `kit` stays `"0.4"`. Hashed with `./hash.sh maze`; `./check.sh` reports no violations.

**Dialect changes** (`maze/maze.dialect.js`):

- `types: { cell2: vector(2, "f64") }`, so `point2@cell` pairs with a vector type.
- `state` gains `player.at: cell2` and `picked: list(struct({ at: cell2 }), 8)`. The existing `player.x`, `player.y`, `grid`, `t`, `score`, `coinsLeft` are kept, so `text(state)` and the UI views still work.
- `frames.cell` (dims 2): grid cells, x right, y down, origin at the center of the top-left cell, with an `extent` from `record.grid`, so a composer can write `"fit"`.
- `frames.time` (dims 1): seconds since the run started.
- `ports.out`:
  - `player` — `point2@cell`, from `player.at`. A stranger uses it to place something on the maze (a spark on the player, a camera that follows).
  - `picked` — `Event<{ at: point2@cell }>`, from `picked`. The one event: a coin picked up in this step. A stranger uses it to fire a burst, a sound or a score pop at the coin's cell.
  - `score` — `f64`, a scoreboard reads it.
  - `coinsLeft` — `f64`, a stranger reacts to 0 (all coins taken).
  - `t` — `f64@time`, a stranger uses it for timing (a lighting cycle, a timer display).
- Host duties added as comments beside `state`: fill `player.at`, refill `picked` each step and empty it at the start of the next, advance `t` by the tick.

**Example:** `maze/examples/02.js`, a 12 × 7 level with coins in the corners and along an inner corridor, listed in the manifest. Its control uses `pad.a` to step two cells.

**Not changed:** the Grammar, the UI, `examples/01.js`, and the existing `text()`.

## 3. Where the draft misled you

- `packaging.md`, "What a package does not have (yet)": "**No ports or seams.** How a package declares what it offers to a glue Program is still being designed." This contradicts `seams.md`, which defines `ports` in `defineDialect` and tells the author to declare them. I followed `seams.md` and treated the packaging note as stale.
- `seams.md`, "Outputs": "`from` is a path into it (`"player.at"`) or a lambda `(s) => …` written as a UI value lambda is". The lambda form is not defined anywhere I could read, so I used the path form only. The draft's own example uses a lambda for `player`, so the two examples disagree about what is canonical.
- `seams.md` example `player: struct({ at: "cell2" })` suggested replacing a position record. I added `at` alongside `x`/`y` instead, because the draft did not say whether a port may read a state field that duplicates another. I did not want to break `text()`.

## 4. What you guessed

- `vector` is importable from `kit/define` (`seams.md` uses it bare, `packaging.md` names only `kit/define` as an import, and neither lists the exports).
- `kit` stays `"0.4"`. I could not tell whether ports and frames need a newer kit; the draft does not say which kit version introduced them.
- `extent`'s `record` is the Program record and has `grid` as a `string[]` (the grammar declares `grid` as `data("string[]")`). I did not confirm that the record exposes it this way.
- `t` is in seconds, and the host advances it by the tick length. `tick` is in `(0.01, 1]` and is probably seconds, but the draft gives no unit for it.
- `picked` max 8. A step is at most `dash` cells, and `dash` has no upper bound in the Grammar (the example uses max 4), so 8 may be too small for a Program that sets a bigger `dash`. I chose 8 as a round number.
- `player.at` is the same cell as `player.x`/`player.y`; I wrote both and left the host to keep them equal.
- `cell` note: "x counts columns to the right, y counts rows down"; I did not say whether cells are square, because the draft has no slot for that.
- `score` note "as the host keeps it" is deliberately vague, because the host's scoring rule is not in the package.
- Version bump to 0.2.0 because the change adds to the language (R2).

## 5. Gaps

1. **An Event's per-step bound cannot depend on a param.** `picked` has a fixed max (8), but the number of coins one step can pick up depends on `dash`, which is a per-Program param with no bound in the Dialect. There is no way to say "max = dash".
2. **Host duties have no place in the draft.** I wrote them as comments beside `state`. Nothing checks that a host does them (player.at, picked refill, t advance). The draft says "say so where your host's behavior is described", but there is no declared host contract.
3. **No kit version for ports and frames.** The manifest's `kit` is the only version field, and the draft does not say which kit version introduced `ports` and `frames`.
4. **Packaging and seams disagree** about whether ports exist yet (see section 3).
5. **Examples can't exercise ports.** An example builds one Program; a port only meets a glue Program. So `02.js` tests the Grammar and not `picked`. I cannot tell from the checker whether it validated the new ports and frames beyond loading the Dialect: `check.sh` said "no violations" but does not list what it checked.
6. **No way to state an integer or whole-number invariant** for a point (`player.at` is always a whole-number cell).
7. **No way to state whether a frame's axes are isotropic** (square cells), which a composer needs to decide whether `"fit"` distorts.
8. **Lambda form of `from`** is referenced but not defined (section 3).

## 6. Answers

**What you offered.** I offered five outputs: `player` (a point in the cell frame), `picked` (an Event of coin positions), `score` and `coinsLeft` (scalars), and `t` (a quantity in seconds). I considered and left out: the grid itself (the draft says grids do not cross the wire, and a 64-string list is too large to be a useful signal); a per-cell coin list (same reason, and `picked` covers what changes); a `finished` boolean (`coinsLeft == 0` covers it, and a fifth port would be a second way of saying the same thing); the Pad and the player's `steps`/`dx` intent (these are things the maze takes in, not things a stranger reacts to).

**Frames.** A stranger learns from the `note` where the origin is and which way the axes point, and from `extent` how big the content is. That is enough to write `"fit"` against a px frame. It is not enough to know whether the cell is square, to know what unit `tick` is in, or to know whether `player.at` is always a whole number. Those facts are in my notes as prose, and the draft gives no structured place for them.

**The host.** The host must now: set `player.at` to the cell the player stands in each step; refill `picked` after each step with the coins picked up during that step and empty it at the start of the next; advance `t` by the tick length each step. `seams.md` makes the refill rule clear for `Event` outputs ("your host refills it each step ... Say so where your host's behavior is described"). The `player.at` and `t` duties are not stated anywhere in the draft; I inferred them from how a port reads state.

## 7. Files

Opened (all under `/private/tmp/3d093c96-seams/r2-maze`):

- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `check.sh`, `hash.sh` (read for their commands only; I did not open the scripts they invoke)
- `maze/maze.dialect.js`, `maze/maze.grammar.js`, `maze/maze.ui.js`, `maze/wb-package.json`, `maze/examples/01.js`

Written:

- `maze/maze.dialect.js`, `maze/wb-package.json`, `maze/examples/02.js` (new), `REPORT.md`

The folder listing also showed `transcript.jsonl` and `stderr.txt`. I did not open them. I opened nothing else on this machine and did no web search.
