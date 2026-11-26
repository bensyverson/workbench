# Particles author: report

## Difficulty
**2.** The draft covered the mechanics and the checker passed on the first run after the change; the work was in choosing ports a stranger can use without the draft saying what happens when they are unwired or unused.

## What you did
Version 0.1.0 → 0.2.0. `check.sh`: no violations (it reported G111, G112 and G113 before the change).

**Frame**
- `px` (2-D): the particle box in pixels, x right, y down, origin at the top-left corner, `extent` = `[0,0]`..`[width,height]` from `.bounds`. It gives a stranger something to relate their own space to, including with `"fit"`.

**Event inputs** (handled by the host)
- `burst: Event<{ at: point2@px }>`: particles appear where something happened (a pickup, a hit, a click).
- `pulse: Event<{}>`: particles appear at the emitter's own position, for a source with no positions (a beat, a button).

**Value inputs** (read as `inp.*`, through `inputs: { object: "In", name: "inp" }`)
- `intensity: f64`, default 1: an untagged "how lively" multiplier.
- `wind: vec2@px`, default `[0, 0]`: a velocity in px per second.
- `target: point2@px`, default `[0, 0]`: something to be drawn toward or to follow.

**Grammar**
- Emitter options `"trigger?": ref("in")` and `"count?": "number"` (particles per record).
- R010: the trigger names a value input. R011: `trigger` and `count` must come together. R012: `count` is not a whole number in 1..10000.
- `rate` stays required, so a burst-only emitter writes `.rate((t, live) => 0)`.

**Other**
- The host's behavior for each input is in a comment above `ports`, with a pointer to it from the comment on `state`.
- Added `examples/07.js` (uses all five inputs) and `refusals/r07.js` (R010), both listed in the manifest, and rehashed.
- The UI, `state` and the existing examples and refusals are unchanged.

## Where the draft misled you
Little did. One sentence suggests more checking than there is:

> "**Your Grammar can name an input** with `ref("in")`: for example, an emitter's `{ trigger: ref("in") }` option is checked against the inputs you declared, with a did-you-mean."

A "trigger" can only sensibly be an `Event` input, but `ref("in")` is described as checking against all declared inputs. I took that literally and added R010 to refuse value inputs. I did not test whether the kit would refuse them by itself first.

## What you guessed
- **`Event<{}>`**: the draft doesn't say a record may be empty. I used it for `pulse`; the checker accepted the declaration. I don't know that a source event with fields can be wired into it, though "fields the input does not take ... are dropped" implies so.
- **Form of a vector or point `default`**: only a scalar default is shown. I wrote `[0, 0]`.
- **Default for a point**: it is read in `px` without conversion.
- **Lambda permissions**: the draft doesn't say whether slots or helpers need a `may` entry (such as `read In`) to read inputs. I added none; `rate`, `spawn` and `force` in the new example were accepted. `update` and helpers are untested.
- **When value inputs are sampled**: I said once before each tick, held for the whole tick.
- **Event timing and order**: handled before the tick, records in order, emitters in declaration order.
- **Limits**: `maxRate` does not limit triggered particles; `maxParticles` does, and the excess is dropped.
- **A burst outside the box**: the particles still spawn.
- **A burst's position**: `p.pos` starts at `at`, replacing the emitter's `x, y`; `spawn` may still move it.
- **`rng` and `i`**: triggered particles share the emitter's numbering and the usual random stream.
- **Name of the inputs object**: `inp`, as in the draft's example.
- **Time**: stated as seconds. I declared no time frame because no input is a time or duration.

## Gaps
Smallest first.

1. **`ref("in")` can't be limited to `Event` inputs** (or to value inputs). I wrote the check by hand with the two names listed in the Grammar.
2. **A record has no optional fields.** `burst` would be better taking an optional count, velocity or strength. Requiring any of them would shut out sources that only have a position, so I take only `at`.
3. **No way to know whether a value input is wired**, and a default can't depend on the Program. `target` has no good constant default: (0, 0) is a real place, so a Program that pulls toward it pulls to the corner when unwired. The box's center would be right, but it comes from `.bounds`.
4. **No compound units.** `wind` is px per second but can only be tagged `vec2@px`. The wire converts the length; a source that measures per beat or per step gets a wrong speed with no diagnostic.
5. **Nothing says an input is unused by this Program.** Ports belong to the Dialect, so a composer can wire `burst` into a Program with no burst emitter, or `wind` into one that never reads it. Nothing happens and nothing is reported.
6. **An event's data can't reach my lambdas.** The draft sends `Event` inputs to the host only. `spawn` sees the burst's position through `p.pos`, but anything else (a kind, a strength) would have no way in that the draft describes.
7. **Nowhere declared for host behavior.** `count`, ordering and caps live in comments. A composer sees only the `note`s, and the checker can't test that a host does what the comment says (this package contains no host code).

## Answers
**1. What did you accept, and what did you leave out?**
I accepted `burst`, `pulse`, `intensity`, `wind` and `target` (reasons above). The aim was one input with a place, one without, and three values that cover amount, motion and location.

I left out:
- **A `count`, velocity or color/kind on `burst`**: every field would be required of every source, and I can't know a stranger's enum.
- **A gravity input**: `wind` already carries a vector that a force can add as it likes.
- **A boolean "emitting" switch**: `intensity` at 0 does it for Programs that read it.
- **A list of points** (many attractors): I did not try a list-valued input, and nothing in the task needed one.
- **A duration or lifetime input**: it would need a time frame, with no clear user.
- **Outputs**: the task asked for inputs and frames.

**2. How would a stranger know how their positions map onto your box? Is what `seams.md` lets you say enough?**
They read the `px` frame's `note` (axes, origin, continuous positions) and the `extent` from `.bounds`, then write `.frame(theirs, fx.frame.px, "fit")` or an explicit edge. For a source that is also y-down and wants its whole area centered in the box, that is enough.

It is less enough elsewhere:
- `"fit"` is described as one scale, centered. The draft doesn't say it ever flips an axis, so a y-up source would apparently come out upside down with no diagnostic, because the axis directions exist only in prose.
- For a y-up source the composer must write a negative scale and an offset that depends on my box's height. That works, but they compute it by hand from `.bounds`.
- The box is set by each Program, so the note can't give numbers.
- Sources with no meaningful space (a sequencer's pitch and time) have nothing to fit; `pulse` and `intensity` are for them.

**3. What must the host now do, and is that clear from `seams.md`?**
- Before each tick, collect the `Event` records received since the last one, and for each, spawn `count` particles from every emitter whose `trigger` names that input, at `at` (`burst`) or at the emitter's position (`pulse`).
- Run the same `spawn` lambda for them, within `maxParticles`.
- Read each value input, or its default, once per tick and make it readable as `inp`.

`seams.md` is clear that events arrive converted, "before each step" and "since its last step", and that what they do is up to me. It is less clear on the value side: it says the members are filled and what the default is, but not whether the kit or the host supplies the current value, or when it is sampled. It also doesn't say what happens to events when the receiving part is paused, or how two parts with different tick lengths are scheduled (how many records pile up in one `burst` step, and whether a held value can be stale).

## Files
Opened, all under `/private/tmp/3d093c96-seams/r1-particles/`:
- `seams.md`, `rules.md`, `task.md`, `packaging.md`
- `check.sh`: I printed its contents (a two-line wrapper), which goes slightly beyond the listed reading. I did not open the script it runs.
- Everything in `particles/`: `wb-package.json`, `particles.dialect.js`, `particles.grammar.js`, `particles.ui.js`, `particles-field.js`, `examples/01.js`–`06.js`, `refusals/r01.js`–`r06.js`
- Written: `particles/examples/07.js`, `particles/refusals/r07.js`, the dialect, grammar and manifest, and this report

I ran `hash.sh` and `check.sh` without opening the code they call. A directory listing showed `stderr.txt` and `transcript.jsonl` in the work folder; I did not open them. I opened nothing else and did not search the web.
