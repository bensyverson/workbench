# Composer's report

## 1. Difficulty

**1 (easy).** The one wire the task needs connected by field name with a single `"fit"`, and passed on the first run; the only real design work was the swarm's `heed` lambda.

## 2. What you did

**`court` (bounce).** A 160 × 120 box ticking at 1/60, with two balls (`red`, `blue`), no gravity, drift or rebound lambda, so they keep their speed and keep hitting walls. I started with three and cut to two (13 hit records by T = 8 instead of 20) so fewer lures are live at once and a viewer can follow them. The checker's gathering figure was the same for both: 4 agents at the first record it reported.

**`crowd` (swarm).** A 320 × 240 ground, the same shape as the box, so each wall lands on an edge of the ground. Ticks at 1/20, deliberately slower than the box.
- Two groups: 40 fast `runners` (150 units/s) and 80 slower `walkers` (70), so a front arrives first and a crowd follows.
- Steer `home` pulls agents back when nothing calls them; `update` adds damping and jitter.
- `heed` sends each agent to its **nearest** live lure. The built-in answer at strength 1 replaces the velocity once per lure, oldest first, so the newest rebound would take the whole swarm.
- Trait `near` holds the nearest distance seen this tick; `update` resets it. This relies on `heed` running after `update`, which the swarm Dialect's slot comment states.

**Frame.** `.frame(court.frame.box, crowd.frame.ground, "fit")`. The checker reports `×2 +0`.

**Wire.** `.wire(court.out.hit, crowd.in.lure)`, with no options.

**Stage.** `.show(crowd)`.

**Check result** (three runs of `check.sh`, all "no violations": one with three balls, two with the final two balls). Final run:

```
wire court.out.hit → crowd.in.lure: at: bounce.box → swarm.ground, point, ×2 +0; drops x, y, wall, impact, velocity, radius, ball; fills strength = 1, duration = 2
workbench.js:46: S206 (warning) court.out.hit cannot feed crowd.in.lure: the wire drops radius, which the input does not take, and fills duration (duration: f64@s = 2) with its default; radius is the same kind of field
run: 13 hit records by T = 8; the first at T = 0.533, reaching crowd.in.lure at (192.7, 240)
run: 4 more agents within 40 of (192.7, 240) in swarm.ground than without, at T = 1.1, 0.567 s after its record
run: replayed, same state hashes at every instant
```

I did not watch the stage in a page, so "worth watching" is a design intention I have not seen. The measured effect is modest: 4 extra agents out of 120.

## 3. Where the docs misled you

Nothing led me to a wrong program. Two things did not match the kit:

- The checker printed **S206**, which is not in the diagnostics table of `seams.md` (it goes from S205 to S251). `seams.md` says "The output's other fields are dropped on the wire" and describes defaults as filling in, with no hint that doing both can warn. The warning also came with no `fix:` line, although `rules.md` says each problem is printed with one.
- `seams.md` says "A package's `reference.md` gives each Event port's max per step and its delivery". `reference.md` does so for `lure`, but for `hit` the max (128) appears only inside the author's prose note.

S206 reads as a guard against a misnamed field: `radius` is dropped while `duration` is filled, and both are quantities. Here they are unrelated (`f64@box` and `f64@s`), so the warning is a false alarm. I left it. Renaming `radius` to `duration` would be wrong.

## 4. What you guessed

- That `lure.at.x` and `lure.at.y` are how a `heed` lambda reads the point (the swarm's third example does this).
- That a velocity far above the group's speed is a fine way to say "go flat out", since the swarm runtime caps it. I read this from the runtime's code; the reference does not say whether the cap applies after `heed`.
- That `a.vx = dx * 4` plus jitter gives a quick approach without every agent stacking on one point.
- That `strength = 1` and `duration = 2` s were acceptable. My `heed` ignores `strength`.
- The sizes, speeds, group counts, tick rates and ball velocities.
- That no `overflow` was needed: `lure` is `keepLast: 16`, and S116 is described for reliable wires only.

## 5. Gaps

Smallest first.

1. **No way to say a drop and a default fill are intended**, so S206 stays on a correct wire.
2. **No constant on a wire or input setting from the glue.** I could not choose how long a rebound's lure lasts or how strong it is; the defaults are the only values.
3. **No computed field.** A harder hit should call louder, but `impact` (`f64@box/s`) cannot become `strength` (`f64`). `rename` cannot do it, since the kinds differ, and the glue has no lambdas.
4. **One stage only.** The balls and walls cannot be drawn with the agents, so a viewer sees the swarm react but not what it reacts to. For this task that is the largest gap. The swarm's text view does not draw lures either.

## 6. Answers

**The seam.** I wired `court.out.hit` to `crowd.in.lure`. I related `court.frame.box` to `crowd.frame.ground` with `"fit"`, which came out as a scale of 2 with no offset, and the wire converted `at`. I converted nothing by hand. No check or run caught a mistake; the one warning (S206) was not pointing at an error.

**What did not fit.** The ports met as written. Both authors had called the position `at`, a `point2` in their own 2-D frame, with x right and y down. That match was luck as far as the docs go, since neither author knew the other. I used no `rename`, `delay` or `overflow`. Defaults filled two fields, `strength = 1` and `duration = 2`. `x`, `y`, `wall`, `impact`, `velocity`, `radius` and `ball` were dropped. The queue sizes differ (up to 128 pushed per step, 16 taken, newest kept) but this did not matter with two balls. What I would have needed for a better result is in Gaps 2 to 4.

**Time.** Yes, `runtime.md` answers it. A record pushed at instant T reaches the consumer at its first step at or after T, and within one instant the producer steps first. So with the box at 1/60 and the swarm at 1/20:
- a rebound pushed at a shared instant is heard in that same instant;
- otherwise it is heard 1/60 or 2/60 s later, at the swarm's next step.

For the first record (T = 0.533 = 32/60) the swarm's next step is 0.55, so I expect a delay of 1/60 s. The check output does not show when a record was delivered, so I have **not** confirmed this from the run. What it shows (agents gathered by T = 1.1; the replay matched) is consistent with it but would also be consistent with other timings.

One subtlety follows from reading the two documents and the bounce runtime together. The bounce step at instant T moves the balls forward by `dt` and pushes its hits stamped T. The rebound it reports therefore belongs to the interval after T, and a swarm stepping at the same instant hears of it with no delay at all. `runtime.md` defines when the record arrives, but not how a package's step instant relates to the physical time of what it reports.

The gathering itself was weaker than I expected. My unverified explanation is that each agent follows only its nearest lure, so several live lures split the swarm.

## 7. Files

I opened these, all inside `/private/tmp/UTdvE6-relay/e-compose`:

- `task.md`, `rules.md`, `seams.md`, `runtime.md`, `packaging.md`, `reference.md`
- `check.sh`: I printed its contents as well as running it. It names a checker script outside the folder, which I did not open.
- `bounce/`: `wb-package.json`, `bounce.dialect.js`, `bounce.grammar.js`, `bounce.runtime.js`, `bounce.ui.js`, `examples/01.js`, `examples/02.js`
- `swarm/`: `wb-package.json`, `swarm.dialect.js`, `swarm.grammar.js`, `swarm.runtime.js`, `swarm.ui.js`, `examples/01.js`, `examples/02.js`, `examples/03.js`
- `workbench.js` and `REPORT.md`, which I wrote

I also listed the folder, which showed the names `stderr.txt` and `transcript.jsonl`; I opened neither, nor the check log. One long command output was saved by my tool harness to a file outside the folder; I did not open it and read `seams.md` and `runtime.md` directly instead. I opened nothing else and did not search the web. I changed nothing in `bounce/` or `swarm/`.
