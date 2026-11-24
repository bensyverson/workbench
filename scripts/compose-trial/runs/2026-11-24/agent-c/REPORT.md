# Report: Glowworm Deep, composed from cave, tiles and glow

## 1. Difficulty

5. The first build of the program passed the checker, but the game needed three workarounds the documents do not cover (a cell-to-pixel length, an exit that can fire twice during a reload, and some kernel operators the subset does not list).

## 2. What you had to guess

- **`num(...)` signature.** Only `int(3, 0, 99, "Seed")` appears, in the composition draft. I wrote `num(0.45, 0.2, 0.8, "Rock density")` on the same pattern (default, min, max, label).
- **Assigning actor fields.** `tiles.md` lists `self.<field>` as readable and says only `w.state.<name>` is "assignable". I assumed `self.awake = true` is allowed for an actor's own state fields.
- **Operators in kernels.** The subset lists `&&`, `||`, `? :` and "comparisons" but not unary `!`. I avoided `!` and wrote `self.awake === false`, which assumes `===` is accepted.
- **Actor `init` with a partial field set.** I returned `{ pos }` for jars and `{ pos, awake: false }` for crickets, assuming unlisted state fields keep their initial values.
- **Where the exit lives.** A cave output is a cell (`level.out.exit`), and the glow needs it in px. I converted it with `tile()` in a tiles `.export("exit", "vec2@px", ...)` and read that export in glow, following the draft's advice to convert where the value enters and export the result.
- **Lamp reach in px.** Glow has no conversions and tiles converts only positions, so I exported the reach from tiles as `$.reach * 8.0`.
- **Light flicker.** I used `noise(p.xy.x * 0.05, p.t * 3.0)` with the shared 2D noise.
- **Descent guard.** I added a cooldown in world state (`cool`, set to 120 ticks after a descent) so one touch of the exit does not descend twice during the reload. This is my invention, not from the documents.
- **Noise in the cave.** `c.seed * 0.7` offsets the noise domain per seed, so each seed gives a different cave.
- **Cricket count.** Computed at build time as `Math.max(2, 9 - $.reach)`, which reads `$.reach` as a number (the G005 build-time read).

## 3. Where the documents misled you

- **`composition-draft.md`, the `lib/` example:**
  > `export const noise = (x, y) => mix(hash(floor(x), floor(y)), hash(floor(x) + 1, floor(y)), smoothstep(0, 1, fract(x)));`

  This ignores `y` and only interpolates along `x`, so the result is striped rather than the natural rock the rules ask for. I wrote a real 2D value noise instead (`lib/noise.js`). The example should be fixed before anyone copies it.
- **`composition-draft.md`, the kernel subset:** the list of allowed operators stops at "comparisons" and does not mention `!` or `===`. I had to guess which of those the kit accepts.
- **`composition-draft.md`, Time:**
  > the game raises `depth` on tick *n*; the cave steps on demand after that tick; the game sees the new cave on its next tick.

  This describes the cycle, but a player standing on the exit for two or more ticks would see `depth` raised twice before the new cave's exit moves, and the draft does not say so. It led me to add the cooldown.
- **`tiles.md`, `.export(...)`:** "adds an output, out.<name>: Signal<type>, computed after each step" does not say whether a `read` lambda may read a cave output (`level.out.exit`) or a parameter (`$.reach`). I assumed both are allowed.
- **`tiles.md`, actors:** "`self.<field>` its .state fields" is listed under "Inside a lambda" without saying whether fields are assignable. The only assignment example is `w.state.steps += 1`.
- **`tiles.md`, Reloading:** "spawned actors are created afresh … world state is kept" does not say whether the player's own position is reset, which decides whether the miner stands on the new cave's start.
- **`composition-draft.md`, Frames:** "Prefer the named conversion" pushes toward `tile()` and `cell()`, but neither covers a length. A reach in cells has no named route to px, so the factor 8 is written by hand. The checker cannot tell a wrong scale from a right one, because `$.reach * 8.0` is an untagged number.
- **`cave.md`, `.spawns`:** the reference says kinds are identifiers and `count` is fixed at build. It does not say a count may come from a build-time expression. I used `Math.max(...)` and it passed, but the reference does not say that is allowed.

## 4. Checker runs

One run of `check.sh`, which printed `no violations (2 files checked)`. I hit no codes, because I wrote the program to avoid the forms I was unsure of (`!`, and so on). I did not test whether the checker catches a deliberate violation, so I cannot say how much its silence proves. The GAP comments and the game's behavior are not checked by the tool.

## 5. What you would change

Smallest change first:

1. Fix the `noise` example in `composition-draft.md` so it is 2D. Anything copied from it gives a striped cave.
2. List the allowed unary and comparison operators in the kernel subset, with `!` and `===` written out.
3. Say in `tiles.md` whether actor fields (`self.<field>`) are assignable, and whether an `.export` `read` may read a cave output or a parameter.
4. Add to the Time section what happens when a cross-part cycle fires twice in one step (an exit touch is the obvious case), or give a named guard.
5. Add a named length conversion beside `tile()` and `cell()`, such as a cells-to-px function, so a reach or a radius does not need a hand-written `* 8`. This is the one GAP the current draft cannot close.
6. Document `num(...)` next to `int(...)`, including its argument order.
7. Say in `tiles.md` what a reload resets: whether the player's position and world state are kept, and whether the player is respawned at the new start.
