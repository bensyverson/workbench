# REPORT: particles author

## 1. Difficulty

2 of 5: the draft's input example was close to what particles needed and `check.sh` passed on the second run. The hard part was deciding what the host does with an Event, because the package has no host code and the draft names no place to describe one.

## 2. What you did

`particles` goes from 0.1.0 to 0.2.0. Everything that was there still builds. I added:

- **Frame `px`** (`dims: 2`). Its note: pixels of the box set by `.bounds({ width, height })`, x right, y down, (0, 0) at the box's top-left corner and (width, height) at its bottom-right. It has an `extent` of `{ min: [0, 0], max: [width, height] }` built from the Program's bounds, so a composer can write `"fit"`. Every position and velocity in the language is already in these pixels, so this frame just names what was implicit before.
- **Input `burst`**: `Event<{ at: point2@px }>`. This is the main thing a stranger wants: "something happened here, show it". The record takes only `at`, so any output whose record has a point field named `at` can feed it, whatever other fields it carries.
- **Input `level`**: `f64`, untagged, `default: 1`, read as `inp.level`. It is a plain 0-to-1 intensity, such as a loudness, a health bar or a combo meter, that a Program uses to scale a rate or a speed. I left it untagged on purpose: it is a ratio, not a length.
- **Input `target`**: `point2@px`, `default: [0, 0]`, read as `inp.target`. It is a moving place, such as a player or a cursor, that a force can pull toward or that a spawn can aim at. It is a point because it is a place, and it converts with scale and offset.
- **`inputs: { object: "In", name: "inp" }`**, plus an empty `In` object and the global `inp`, as the draft shows.
- **Grammar:** a new emitter option, `"trigger?": ref("in")`, which is how a Program says which emitters an input drives. There is a new check, R010: a trigger must name an Event input, not a value input.
- **Host description:** a comment block above `ports` in `particles.dialect.js`, and a note at `state`. When a burst record arrives, the host does this for each emitter whose trigger is `burst`:
  - it calls `rate(t, live)` once and spawns that many particles at once (rounded down, at most `maxRate`, never more than `maxParticles`);
  - the particles start at the record's `at`, not at the emitter's (x, y);
  - it then runs `spawn` on each one as usual.

  A triggered emitter does not emit on its own. For value inputs the host only makes the wired value, or the default, readable as `inp.*` before each tick. `state` does not change.
- **`examples/07.js` ("pickups")**: `pop` is triggered by `burst` and its rate scales with `inp.level`; `glow` trickles particles toward `inp.target`.
- **`refusals/r07.js`**: a trigger that names `level` is refused with R010.

## 3. Where the draft misled you

- *"Your Grammar can name an input with `ref("in")`: for example, an emitter's `{ trigger: ref("in") }` option is checked against the inputs you declared, with a did-you-mean."* I read this as a check that a trigger is a valid trigger. It isn't: `ref("in")` accepts value inputs too. `trigger: "level"` passes the ref and only my own R010 catches it, and `r07.js` confirms that. I had to repeat the list of Event inputs by hand (`EVENT_INPUTS` in the Dialect file), and that list can drift from `ports.in`.
- *"An `Event` output is a state list your host refills each step … Say so where your host's behavior is described."* and *"An `Event` input goes to your host"*. Both assume a package has a place where its host's behavior is described. A package as `packaging.md` defines it has no host file and no host key. The only "description" is comments in the Dialect, so I put it there. Nothing checks that a real host does what those comments say.
- The draft's own example note, *"fires every emitter whose trigger is 'burst', once per record"*, suggests that triggering is a known meaning. It says nothing about how many particles a record makes. I had to choose that myself (see Guesses).

## 4. What you guessed

- **How many particles one burst record makes.** I chose: the emitter's existing `rate` lambda gives the count per record, rounded down and capped at `maxRate`. When an emitter is triggered, `rate` changes from per-second to per-record. I did this rather than add a new option.
- **Whether a triggered emitter also emits continuously.** I chose no.
- **Where burst particles start.** I chose the record's `at`, overriding the emitter's (x, y). The emitter's x and y are still required and still checked against the bounds.
- **How to write the default of a `point2` input.** I wrote `[0, 0]`. The draft only shows `default: 40` for an `f64`. The checker accepted the array, but no rule says this is the right form.
- **What to do with records outside the box.** I chose to keep them.
- **Where the host description goes.** I put it in comments in `particles.dialect.js`, above `ports` and at `state`, because that is where the existing comments describe what "the host" does.
- **The diagnostic code for the new check.** I used R010, continuing the package's own R00x series.
- **The default of `level` when nothing is wired.** I chose 1, so that a Program built on its own behaves at full strength.

## 5. Gaps

Smallest first:

1. **No spelling for a vector or point `default`.** The draft gives only a scalar example.
2. **No way to ask `ref("in")` for Event inputs only.** A trigger can name a value input unless the author writes a check and a second list by hand.
3. **The point/vector distinction disappears inside lambdas.** `inp.target` is just a `vec2`, so `inp.target - p.pos` and `inp.target + p.pos` are both accepted. The seam knows that `target` is a point, but the language cannot.
4. **No place for the host's contract.** Neither the manifest nor the Dialect has one, so "what the host does with each input" is prose that is never checked. It is also not visible to a composer unless they read the source, beyond what fits in the port's `note`.
5. **A record's fields other than `at` can't reach the lambdas.** `spawn` cannot read the record that triggered it, so a burst can't carry a strength, a color or a kind. That is why the input takes only `at`. I needed something like "the current record" readable in `spawn`, and the draft says only that Events go "to your host, not your lambdas".
6. **No time frame and no compound units.** Velocities here are px per *second*, and `tick` is in seconds. `vec2@px` says nothing about time, so a stranger's velocity in cells per step would convert by space and arrive with the wrong time base. I therefore left out a velocity input such as `wind: vec2@px`. A `dims: 1` frame for seconds can be declared, but a seam type can't say "px per s".
7. **Steps are not aligned.** The draft says a host gets "the records produced since its last step". It does not say how parts with different step lengths (`tick(1/60)` here, something else elsewhere) are scheduled. So I can't tell a stranger how late a burst may land, or whether a value input is read once per tick or once per foreign step.

Considered and left out, apart from the gaps above: `count` or `strength` fields on `burst` (gap 5); a `wind` vector input (gap 6); outputs such as live counts. The task asked for inputs and frames, and I didn't want to add surface nobody asked for.

## 6. Answers

**What I accepted.** I accepted one Event input and two value inputs. The Event input is `burst`, a point in px, which fires every emitter whose `trigger` is `burst`. The value inputs are `level`, an untagged 0-to-1 number, and `target`, a point in px; lambdas read both as `inp.*`. These three cover what a game, a level editor or a sequencer most plausibly has to give a particle system: a moment and a place, an intensity, and a moving position. I kept `burst`'s record to the single field `at`, so that almost any event with a position can feed it. I left out:

- extra record fields such as strength or kind, because `spawn` could never read them;
- a wind or velocity input, because seams can't say "per second" and a converted velocity could arrive with the wrong time base;
- a radius quantity, because a Program can already set spread from a param or from `inp.level`.

**Frames.** A stranger reads the `px` note: x right, y down, the origin at the box's top-left corner, the far corner at (width, height). Its `extent` lets a composer write `"fit"` and never see the numbers. For positions this is enough. The note plus `extent` say everything a scale-and-offset edge needs, and a negative scale handles a stranger whose y points up. What the draft can't express is time. My velocities are per second, but a frame is only space, and nothing relates one part's step to another's. Also, "fit" only centers one box inside the other. If a stranger's content should map to only part of my box, the composer has to work out the edge from the notes, which is fine but is all prose.

**The host.** The particles host now has to do several things it didn't before:

- before each tick, receive the burst records that arrived since the last tick, already in px;
- for each record, run every emitter triggered by `burst`: call `rate` once for a count and spawn that many particles at `at`;
- stop running triggered emitters continuously;
- before each tick, bind `inp.level` and `inp.target` to the wired values or their defaults.

From `seams.md`, the "receive the records, already converted" part is clear. The rest is not: everything about what the language does with a record is left as "its own business", and nowhere says where that is written down. The package has no host file, so the contract lives only in Dialect comments. Nothing checks that a host honors them, and a stranger sees only the port `note`. The draft also doesn't say whether value inputs are read once per tick or more often, or what happens when parts step at different rates.

## 7. Files

I opened `task.md`, `rules.md`, `seams.md`, `packaging.md`, `check.sh` and `hash.sh`, and every file in `particles/`:

- `wb-package.json`
- `particles.dialect.js`
- `particles.grammar.js`
- `particles.ui.js`
- `particles-field.js`
- `examples/01.js`–`06.js`
- `refusals/r01.js`–`r06.js`

I created `examples/07.js` and `refusals/r07.js`. A directory listing showed `transcript.jsonl` and `stderr.txt` in the trial folder, but I did not open them. I opened nothing else on this machine and did not search the web.
