# REPORT: particles author

## 1. Difficulty

3 of 5. The seams and ports were straightforward to write and the checker passed on the first full run. What was hard was saying what a burst does to a particle system, which `seams.md` leaves to the language.

## 2. What you did

**Ports (in `particles.dialect.js`, `ports.in`):**

- `burst: { seam: "Event<{ at: point2@px }>", note: … }`. An Event input that makes particles appear. A stranger wires a list of points into it (for example, a game's pickup events) and gets a burst of particles at each point. Its note says the burst happens once per record, at the record's position, in pixels inside the box.
- `radius: { seam: "f64@px", default: 40, note: … }`. A value input read in lambdas as `inp.radius` (declared with `inputs: { object: "In", name: "inp" }`, an `In` object, and the global `inp`). A stranger uses it to set how far from the burst point particles may start. It has a default, so an unwired radius still works.

**Frames (in `particles.dialect.js`, `frames`):**

- `px: { dims: 2, note: "pixels inside the bounds box; x right, y down; (0, 0) is the top-left corner of the box", extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] }) }`. A stranger needs the axes, the origin and the size of the box to place positions, and `extent` lets a composer write `"fit"`. No `edges` are declared, because this package does not know any other frame.

**Grammar (in `particles.grammar.js`):**

- The emitter's opening options gain `"trigger?": ref("in")`. An emitter with `trigger` is driven by the named input and does not spawn at its own `x` and `y`.

**Host comments (in `particles.dialect.js`):**

- Above `ports.in`, the host's handling of `burst` and `radius` is described. At `state`, the host's per-tick order is described.

**Example (`examples/07.js`, new, listed in the manifest):** a `pop` emitter with `trigger: "burst"`. Its `spawn` reads `inp.radius` to scatter particles around the burst point.

**Manifest:** version raised `0.1.0` → `0.2.0` (kit still `0.4`), `examples/07.js` listed, and all files rehashed with `./hash.sh particles`. `check.sh` reports no violations.

Not changed: the UI, `particles-field.js`, the existing examples and refusals, and the existing `state` shape.

## 3. Where the draft misled you

- `packaging.md`, "What a package does not have (yet)": "No ports or seams. How a package declares what it offers to a glue Program is still being designed." `seams.md` defines ports in `defineDialect`, so the two documents disagree about whether ports exist yet. I followed `seams.md`.
- `seams.md`, "Your Grammar can name an input with `ref("in")`: for example, an emitter's `{ trigger: ref("in") }` option". This matched exactly what I needed, and the checker accepted it. But the example says nothing about how the trigger's Event-ness is checked, so I could not tell whether `trigger` may name a value input.
- `seams.md`, Frames: "`extent(record)`" takes a `record`, which the draft never describes. I wrote `record.bounds.width`, which is the Grammar's shape. I did not know whether the built Program has the same shape.

## 4. What you guessed

- **Where `frames` and `inputs` go.** The draft shows them as bare keys without naming the call. I put them in `defineDialect`, beside `params` and `state`.
- **The burst's effect on a rate-driven emitter.** `seams.md` says what the host receives but leaves the spawn to the language. I chose: each record places a triggered emitter's particles at the record's point (instead of `x`, `y`), then runs its `spawn`. The count still comes from the emitter's `rate` lambda for that tick. This is a guess, and the comment at `ports.in` says so.
- **The unit of `px`.** I wrote that positions are "pixels inside the bounds box". The stage draws the box scaled to the element, so a pixel here is not a screen pixel. I kept the name `px` because the draft's examples use it and because I could not find a better one.
- **`default: 40` is in `px`.** The draft gives a default as a bare number and does not say which frame it is in. I assumed the port's own frame.
- **`inp.radius` in lambdas.** The draft says a value input is read like params are read through `$`. I assumed reading `inp` needs no `may` entry, since `$` has none, and I did not add one to the slots.
- **`trigger` as an emitter option.** I put it in the opening `data`, with a comment, and did not add a new refusal for it.
- **Position at spawn.** The example's `spawn` adds offsets to `p.pos`, which assumes the host sets `p.pos` before `spawn` runs. The existing examples assume the same for `x`, `y`, but no document says it.

## 5. Gaps

Smallest first:

1. **A lambda cannot read a burst's point.** `spawn` cannot see the record's `at`, so the host must put the particle at the point before `spawn` runs. The draft has no way to declare "the host sets this particle's start position from the record", so that rule lives only in a comment.
2. **`ref("in")` cannot require an Event input.** A `trigger` naming a value input is not refused, so a stranger could drive an emitter from `radius`. The draft has no way to say "an input of seam kind Event".
3. **No statement of what one Event does to a rate-driven emitter.** Count, timing and whether `rate` still applies are not stated in `seams.md`. The language has to decide, and the draft does not say the language's own host description must cover it, or where.
4. **Value inputs have no stated host protocol.** The draft says the host gets Event records but not who reads value inputs, when, or whether the host or the kit supplies `inp` each step.
5. **`extent(record)` has no defined record shape.** The draft uses `record.grid` in one example and never says what fields a built Program's record has.
6. **A frame cannot say what its unit means on screen.** `px` is in the box's own units, not screen pixels, and nothing lets me say so beyond the `note`. A composer may still assume `"fit"` gives screen pixels.
7. **Contradiction between `packaging.md` and `seams.md`** about whether ports exist (see section 3).

## 6. Answers

**What you accepted.** I added `burst` (an Event of points in `px`) and `radius` (a value of `f64@px`, default 40, read in lambdas as `inp.radius`). I considered and left out: a per-burst count input, because the rate lambda already controls counts and a second source would conflict with it; a `vec2@px` wind or gravity input, because a lambda can read `$.wind` already and a second route would split the param; and a second Event input for clearing particles, because no emitter needs it yet and it would add a second host behavior to describe. `trigger` is the only way an emitter names a burst, so each emitter reacts to one input at most.

**Frames.** A stranger learns the axes (x right, y down), the origin (top-left corner of the box) and the size (`extent`) from the `px` frame's `note` and `extent`, which is enough for `"fit"` to place their positions in the box. It is not enough to say that `px` units are the box's own units scaled to the screen rather than screen pixels, which a stranger is likely to assume. `seams.md` has no field for "this unit is abstract" or "scaled for display", so the `note` is the only place to say it.

**The host.** The particles host must now: (a) take the burst records made since its last tick before stepping; (b) for each triggered emitter and each record, place its particles at the record's point (not its own `x` and `y`), then run `spawn`; (c) make `inp` available to lambdas, with `radius` at its default when unwired. `seams.md` says the host "receives the records … already converted into your frames" and that "what it does with them is up to your language", so the duty to act is clear. It is not clear from `seams.md` how value inputs reach the host, or when, which is gap 4.

## 7. Files

Opened and read (with the `Read` tool or `cat`):

- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/particles.ui.js`, `particles/particles-field.js`, `particles/wb-package.json`
- `particles/examples/01.js` through `06.js`
- `particles/refusals/r01.js` through `r06.js`

Written or changed:

- `particles/particles.dialect.js`, `particles/particles.grammar.js`, `particles/wb-package.json`
- `particles/examples/07.js` (new)
- `REPORT.md`

Run but not read: `check.sh` (run three times: before the change, three violations as expected; after it, no violations on the last two runs), `hash.sh` (run once, `particles`: 17 files hashed).

Opened nothing else. In particular I did not open `transcript.jsonl` or `stderr.txt` in the working directory, and nothing outside `/private/tmp/3d093c96-seams/r2-particles`.
