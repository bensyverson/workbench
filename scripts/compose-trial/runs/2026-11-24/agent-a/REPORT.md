# Report: Glowworm Deep

## 1. Difficulty

**3 out of 10.** The draft and the three references covered every seam the game needs, and the first program passed the checker. The hard parts were behavior the documents leave unspecified (when a reload happens within a tick, how cells become px for a scalar), not missing API.

## 2. What you had to guess

- **`num(...)` signature.** Only `int(3, 0, 99, "Seed")` is shown. I guessed that `num` works the same way: `num(default, min, max, label)`.
- **Order of reload and `.update` within a tick.** tiles.md says the game "reloads at its next tick", and the draft says "the game sees the new cave on its next tick". Neither says whether the reload comes before or after input, actor updates and the world update in that tick. I assumed it comes first. If it comes after, the miner is still standing on the old exit and depth goes up twice. The world cannot tell which level it is on (no "reloaded" flag, and `w.time` is "seconds since the level loaded" but nothing says when that resets), so I could not guard against it. Marked `// GAP:`.
- **Exit detection.** Nothing defines vector equality, so I did not write `cell(w.player.pos) == level.out.exit`. I used `distance(w.player.pos, tile(level.out.exit)) < 4.0` instead.
- **Is `!` in the kernel subset?** The subset lists `&&` and `||` but not unary `!`. I avoided it: `if (self.awake)`, `<=`.
- **Can actor `.state` fields be assigned?** For `w.state`, tiles.md says "assignable". For `self.<field>` it says nothing. I assumed they can be (`self.awake = true`).
- **Reach in cells versus px.** Reach is "in cells". In a tiles lambda and in the glow lambda I wrote `$.reach * 8.0`. The draft says "arithmetic erases tags … the checker trusts you; prefer the named conversion", but `tile()` converts positions, not lengths, and glow has no conversions at all. So the 8 px cell size is hard-coded in two places. Marked `// GAP:`.
- **Where the shared noise gets its variety.** `c.rand` is per cell and does not fit the "natural walls" requirement, so I put the seed into the noise coordinates (`c.seed * 17.0`) myself. I guessed that a value-noise helper of my own is what "a noise function" means.
- **Cricket count from reach.** `count` is "fixed at build", so I computed it at build time from `$.reach` with `Math.max(1, 11 - $.reach)`. The draft says that changing a parameter read at build time rebuilds the program. I assumed a rebuild is acceptable when the player moves the reach slider.
- **Flicker on the "edge".** I modulated the radius with `noise(p.t * 6.0, d * 0.05)`, which varies over time and distance. Nothing says what a flickering edge should look like.
- **Cricket "hops".** I used continuous `w.move` toward the miner. The documents have no notion of discrete hops, and none is needed.
- **Unused spawn context.** I guessed that `where` lambdas with only `c.x` are fine, and that the start, jar and cricket kinds may all share `level.out.spawns` filtered by `kind` in `.spawn`.

## 3. Where the documents misled you

- composition-draft.md: *"`"lerp"`: interpolated between the last two completed steps … Smooth motion for a `frame` part reading a `tick(60)` part."* This led me to sample the miner's position with `"lerp"`. Read alongside tiles.md's reload rule, it means that on the frame after a level change the light sweeps from the old exit to the new start. The draft offers no snap or reset. It is not exactly misleading, but the recommended mode is wrong right where levels change. Marked `// GAP:`.
- composition-draft.md: *"Prefer the named conversion: it says what you mean, and it stays right if the cell size changes."* I went looking for a named conversion for the reach (a length in cells) and found none, neither in tiles (`tile`/`cell` are for positions only) nor in glow ("no conversions of its own"). The advice can't be followed for scalars.
- tiles.md: *"`.state(fields)` // world state, kept across level reloads"*. This is right and useful for `depth` and `oil`. But it implies the reload is a well-defined moment, and the document never places that moment within the tick order ("input, then every actor's `update`, then the world's `update`").
- composition-draft.md example: `import { program, params, int, num } from "kit";` imports `num`, but no document says how to call it.

## 4. Checker runs

Four runs, all `no violations`: the first full program, then after removing an unused `cell` import, after adding the `// GAP:` comments, and once more as a final check. I hit no codes. I would have expected S251 (cells versus px), S301 (seed) and S313 (reading own exports), but the draft's examples showed the right forms before I could make those mistakes.

## 5. What you would change

1. **kit / draft:** document `num(default, min, max, label)` (and `int`) next to `params`.
2. **Kernel subset:** say whether unary `!`, `==` on vectors, and assignment to `self.<field>` are allowed.
3. **tiles.md:** put the reload in the tick order ("at the start of the next tick, before input"). Say when `w.time` resets. Consider a `w.loaded` (or `w.level`) counter so the world can tell a fresh level apart.
4. **tiles.md:** add a scalar conversion such as `cells(n): f32@px`, or export the cell size as a constant. Then a reach given in cells can be converted by name, and exported as a px length for glow, instead of a hard-coded `* 8`.
5. **Draft, Sampling:** say what `"lerp"` does across a producer reload (snap, or interpolate). Possibly add `"lerp"` that resets when the producer reloads.
