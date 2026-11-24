# Report: Glowworm Deep composition trial

## Difficulty

2 out of 10. The documents were consistent and complete enough that `program.js` passed the checker on the first run; the effort went into reading, not fixing.

## What you had to guess

- Signatures of `params` helpers: `int(3, 0, 99, "Seed")` is shown, `num(...)` is imported in the example but never described. I assumed `num(default, min, max, label)`.
- That `.smooth(2)` and a `noise(...)` carve over `c.x`, `c.seed` is reasonable (seed mixing with `c.seed * 7.0` is my choice; the docs give no advice on mixing `c.seed` into a noise lookup).
- Whether `tiles` allows several `.spawn` calls with the same `level.out.spawns` source and different `opts.kind`: the reference says "once per kind", so I assumed yes. The first argument `from: Spawn[]` plus `opts.kind` felt redundant.
- Whether a `.spawn`'s actor kinds can reference each other defined later (Cricket reads `Miner` before its `const`). Lambdas are never called at build, so I assumed fine.
- Build-time `Math.max(1, 10 - $.reach)` for the cricket count is allowed (plain JS at build); the `count` slot is "fixed at build" with no lambda form, and a parameter read there is a plain number. Stated in the draft, but I had to infer that `count` accepts it.
- That `w.touching(...)` returns an array I can `for...of`, and that `self.remove()` inside the loop is safe.
- Vector arithmetic in the CPU kernels: `w.input.dir * 1.2` and `w.player.pos - self.pos` are used in the tiles example, so I assumed componentwise ops work on `vec2@px`.
- Exporting the exit in pixels: `.export("exitPx", "vec2@px", w => tile(level.out.exit))` reads another part's output inside a tiles lambda; the draft allows it (snapshot read), I assumed the export's read lambda counts as a runtime lambda.
- Oil units (0-100), burn rate, jar and cricket amounts, speeds, screen 192x128 with 24x16 cave: all invented.
- Whether the actor `.state` is needed for anything: not used.

## Where the documents misled you

- `rules.md`: "Put the helper the game shares between parts in `lib/`." plus G004 "called both from a cave or tiles lambda and from a glow lambda". Mild: I put `noise` in lib, but the lib helper is checked on CPU and GPU; the draft's own sample `noise` uses only first-axis mixing, which looks like a half-written value noise. Not misleading about the checker, but it invited copying something low quality.
- `composition-draft.md` clocks: "Each display frame runs: input, then tick parts, then demand parts whose inputs changed". Nothing said how a new level reaches the tiles part when the seed lambda depends on `depth` raised inside a tick that also still sees the old exit. It does explain the one-step delay, but I then wrote a depth bump that can fire again on the following tick. Hence the `// GAP`.
- `tiles.md`: "`.spawn(kind: Actor, from: Spawn[], opts: { kind: string ...` " uses `kind` for both an actor and a spawn kind in one signature. I had to reread to see which was which.
- `tiles.md` Example prose "`init: s => ({ pos: tile(s.at) })`" is the only place showing how an actor gets its position; the Actor reference does not say `pos` is the required init field.

## Checker runs

Two runs: one with no violations, one after I added `// GAP:` comments (also no violations). No codes were hit at all.

## What you would change

- Smallest: document `num(...)` and `int(...)` argument order and ranges in the composition draft (or a `kit` reference, which does not exist).
- Say outright in `tiles.md` that several `.spawn` calls may share one `from` and differ by `opts.kind`, or drop the redundant `from` argument.
- Add a way to signal a level change to the game (an event on the cave, or a `level` counter output) so "step on exit raises depth once" is expressible without a double-trigger risk. Today I have to rely on the one-step delay.
- Add a hop/jump or a timer for actors (cricket "hops"); `w.move` only glides.
- Let `.map` or `.tiles` mark special cells (the exit) so it can be drawn; the exit has no tile in `rock | open`.
- Ship `lib/noise.js` as a documented stdlib so authors do not copy the draft's half-finished example.
- The checker passed a program whose actors use `Miner` before definition and whose depth logic may misfire; the checker only checks seams, so it says little about whether the game plays.
