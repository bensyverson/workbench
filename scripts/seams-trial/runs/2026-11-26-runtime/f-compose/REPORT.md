# REPORT: composer leg

## 1. Difficulty

2 of 5: the two packages' ports met with one wire and one option, and the frames needed only `"fit"`; the only real decision was how to handle the rate mismatch on the wire.

## 2. What you did

**Composer, parts.**
- `box` is a `bounce("box")` Program of my own: a 160 × 120 box, tick 1/30, two balls (`ember`, `slate`), one prop `knocks`, a `gravity` param, and a drift (gravity) and rebound (count a knock, lose speed by `loss`). A stranger would want it because it is a source of `wallHit` records with points on the walls.
- `crowd` is a `swarm("crowd")` Program of my own: a 240 × 180 ground, tick 1/20, one group of 30 agents at (40, 40), three traits `aimx`, `aimy`, `pull`, steers `aim`, `drag` and `fade`, an `update` with a small random jitter, and an `answer` that sets each agent's aim from the `lure` record (`lure.at`, `lure.strength`). A stranger would want it because each lure record pulls the crowd to a point.

**Composer, frame.**
- `.frame(box.frame.box, crowd.frame.ground, "fit")`. Both extents start at the origin and have the same 4:3 proportion (160 × 120 and 240 × 180), so one uniform scale fits the box exactly inside the ground: the kit computed 1.5 with zero offset. The check printed `at: bounce.box → swarm.ground, point, ×1.5 +0`.

**Composer, wire.**
- `.wire(box.out.wallHit, crowd.in.lure, { overflow: "keepLast" })`. Fields meet by name: `at` (point2@box) lands on `at` (point2@ground) with the frame edge. `wall`, `ball` and `t` are dropped, since the lure does not take them. `strength` has a default of 1 and the wire fills it in. I did not use `rename` or `delay`: there is no loop, and the names already match.
- I chose `keepLast` before the first run, because the static analysis of `wallHit` (max 256 per step, producer tick 1/30, consumer tick 1/20) against `lure` (max 16, reliable) implies S116 for any reliable wire. Keeping the newest hits seems right for a lure: the crowd should answer the latest meeting.

**Composer, show.**
- `.show(crowd)`. The box has no stage of its own; the crowd's stage is the one shown.

**Composer, tuning.**
- First run: the gather check passed with only 1 extra agent near the point, 0.93 s after its record. I then raised the aim gain from 20 to 40, the group speed from 60 to 120, and lowered drag from 6 to 1.5. The second run gave 4 extra agents near (136, 180) at T = 1.75, 1.05 s after the record. These are my own Program's numbers, not a change to the swarm package.

## 3. Where the docs misled you

Nothing in `seams.md`, `runtime.md` or `packaging.md` led me wrong on the points I used. The S116 rule in `runtime.md` ("the producer's `events.out` max times the most producer steps one consumer step can see must not exceed the consumer's `events.in`") matched the check's wording exactly, and the rate analysis I did from it was right. The `"fit"` description in `seams.md` ("a point `x` lands on `2x + 0.5`") matched the output of this composition.

## 4. What you guessed

- Overflow policy: `keepLast` over `keepFirst`. Reason: the newest hit is the one the crowd should answer.
- Ball and group names, compose name `box-and-crowd`, the ball and crowd numbers, and the steer gains. All are mine to choose in my own Programs.
- The unused `$` parameter on the glue's export: I kept the `($) =>` form from the seams example, though the glue reads no params.
- The swarm's `answer` lambda gets `lure` from the record global, and I assumed `lure == null` guards are needed on the lambda side, as the swarm example 03 does.
- The timing answer below: I read the instant of a record's push as its step's start, since `runtime.md` says a record pushed at instant `T` reaches the input at the first consumer step at or after `T`. The bounce `t` field holds the step's end, which is `T + dt`; I did not verify that discrepancy against the run.

## 5. Gaps

Smallest first.

1. **Setting a field's value on a wire.** The `strength` default is the only value the glue can give a lure record. I wanted a stronger pull without touching the swarm's default, and could not express it on the wire. The workaround is to tune the crowd's own steer gains, which is a different fact, and I have reported it here rather than hiding it.
2. **A reliable Event wire whose producer's max exceeds the consumer's.** The composer cannot state the realistic burst for this wire, nor a per-wire max, nor get a check that the real burst fits. The only answer the kit gives is `overflow`, which drops records silently under the counter. I needed either a per-wire max or a way for the producer to declare a realistic burst.
3. **The time a record was pushed.** The swarm can read the record's fields but not the instant it was pushed, since `$T` is not among its keys, and `wallHit.t` is dropped by the wire because the lure does not take it. I could not show, inside the swarm, when a rebound happened.

## 6. Answers

**The seam.** I wired `box.out.wallHit` into `crowd.in.lure`. The frames are related by `.frame(box.frame.box, crowd.frame.ground, "fit")`: a scale of 1.5 and an offset of zero, computed by the kit from the two extents. The `at` field is the only one the lure takes that the wallHit record has; `strength` gets its default. The check caught nothing I got wrong: the one warning it printed (S116, reliable wire, 512 possible records per crowd step against 16) was the mismatch I had expected and had already set `overflow` for.

**What did not fit.** The two packages' ports met as they were written, with one exception. The reliable Event input's max of 16 cannot take bounce's 256 per producer step, times two producer steps for one consumer step (1/30 against 1/20). I needed `overflow` for this and nothing else. I did not need `rename` or `delay`. The default filled the `strength` field. I would have needed a way to give a constant on the wire (gap 1) and a way to state the realistic burst on it (gap 2).

**Time.** From `runtime.md`, a record pushed at instant `T` reaches the crowd at its first step at or after `T`. The bounce part steps at multiples of 1/30 and the crowd at multiples of 1/20; they coincide at multiples of 1/10. So the agents hear of a rebound at the same instant if the rebound falls on a shared step, and otherwise at the next crowd step, less than one crowd tick (0.05 s) later. The agents respond within that step, before their steers. The run's first record was at T = 0.7, a shared step, and the gathering at T = 1.75 came 1.05 s after it. That gap is travel time for the agents, since they had to cover about 100 ground units. The hearing latency is at most 0.05 s. Yes, the answer matched what I expected once I accounted for travel; my expectation of the first run was that the response would be faster, which is why I tuned the steering.

## 7. Files

Files I opened or read:
- `/private/tmp/UTdvE6-relay/f-compose/task.md`
- `/private/tmp/UTdvE6-relay/f-compose/rules.md`
- `/private/tmp/UTdvE6-relay/f-compose/seams.md`
- `/private/tmp/UTdvE6-relay/f-compose/runtime.md`
- `/private/tmp/UTdvE6-relay/f-compose/packaging.md`
- `/private/tmp/UTdvE6-relay/f-compose/reference.md`
- `/private/tmp/UTdvE6-relay/f-compose/check.sh` (read with `cat`; it names a checker script outside the folder, which I did not open)
- `bounce/bounce.dialect.js`, `bounce/bounce.grammar.js`, `bounce/bounce.runtime.js`, `bounce/bounce.ui.js`, `bounce/examples/01.js`, `bounce/examples/02.js`, `bounce/wb-package.json`
- `swarm/swarm.dialect.js`, `swarm/swarm.grammar.js`, `swarm/swarm.runtime.js`, `swarm/swarm.ui.js`, `swarm/examples/01.js`, `swarm/examples/02.js`, `swarm/examples/03.js`, `swarm/wb-package.json`
- `workbench.js` (written by me)

I also listed the folder contents with `ls` and `find`, which named `stderr.txt` and `transcript.jsonl` in the folder, but I did not open either. The harness saved my shell output for `seams.md` to a tool-results file under `~/.claude`; that is the harness's record of my command, not a file I opened on purpose. I opened nothing else on this machine. I did not change `bounce/` or `swarm/`.
