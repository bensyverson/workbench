# The runtime relay on a second pairing: findings

*2026-11-26, leaf `UTdvE6` (M4, `SPPLaM`). This is the dogfood of the runtime contract built from Ben's rulings ([the plan](2026-11-26-runtime-contract-plan.md); `8b5c171` per-Program state and input field defaults, `5e0813e` named kernels, `$T`, a null record global, the page part, a wire's `overflow`). The seams were settled and are not re-tested here. Two things are new against the earlier relays ([rerun](2026-11-26-seams-relay-rerun-findings.md), [placeholder](2026-11-26-placeholder-docs-findings.md)). First, both authors get a language whose Programs declare their own per-entity data. Second, the pairing is new: **bounce** (balls in a box that rebound off its walls; each ball carries the `.prop`s its Program declares) into **swarm** (groups of agents steering by named `.steer` rules; each agent carries the `.trait`s its Program declares). With this pairing, the old maze/particles priming of `pos`/`at` is not in play. Packet: `scripts/seams-trial/docs-placeholder/` plus `docs-placeholder/bounce-swarm/`, starting packages `scripts/seams-trial/fixtures/start/`, reference hand-ins `fixtures/valid-3/` ([README](../scripts/seams-trial/README.md)). Records: `scripts/seams-trial/runs/2026-11-26-runtime/{e,f}-{bounce,swarm,compose}/`.*

## Verdict

**The runtime contract held.** All six legs finished clean. No composer changed a package. Every composition gathered agents at the converted wall point and replayed exactly. All four authors found and used the extensible state struct on their own, kept their Program's data across steps, and looked kernels up correctly; both swarm authors walked `record.steers` and called `kernels["<part>.steer.<name>"]`. Difficulty was 1 to 3 (the earlier relays' authors rated 2 to 4). The per-Program state gap, the rerun's largest runtime gap, is closed. **What still costs authors time is the documentation around the contract, not the contract.** Three of four authors were refused once for the undocumented `types` key. The checker had two bugs that the relay exposed (one forced a design change on e-swarm). And the gaps the authors list now sit one level up: a wire that can't set a constant, Event maxes that can't follow the Program, and a Program's own data that can't reach a port.

**Names met, as `at`, in both relays.** All four authors, with no example to copy and two different task wordings ("the point where it met it", "the position in its record"), named the position field `at`. Neither composer needed `rename`.

**n = 1 per model.** As before, read every comparison as an anecdote.

## The runs

Launched with `PACKET=placeholder scripts/seams-trial/run.sh <role> /private/tmp/UTdvE6-relay/<leg> <model>`, the four author legs in parallel, then each relay's composer on its own authors' hand-ins (`run.sh compose <dir> <model> <bounce-leg> <swarm-leg>`). Checks, codes, turns, time and cost: `node scripts/seams-trial/summary.js scripts/seams-trial/runs/2026-11-26-runtime/<leg>...` (no `--skip-last`: the integrator's rechecks ran without `SEAMS_TRIAL_LOG`, so no log has an extra line). Difficulty is from each `REPORT.md`.

| Leg | Model | Difficulty | Checks | Codes (all runs); first clean | Turns | Time | Cost |
|---|---|---|---|---|---|---|---|
| e-bounce | Sonnet 5.5 | 2 | 4 | K011; run 2 | 10 | 105 s | $0.42 |
| e-swarm | Sonnet 5.5 | 2 | 5 | K011, G016 ×2, N004 ×3; run 4 | 14 | 128 s | $0.48 |
| e-compose | Sonnet 5.5 | 1 | 3 | none; run 1 | 15 | 87 s | $0.39 |
| f-bounce | Haiku 5.5 | 3 | 3 | G001–G004 (the starting package); run 2 | 24 | 144 s | $0.04 |
| f-swarm | Haiku 5.5 | 3 | 24 | G001–G004, K011, G016; run 3 | 49 | 413 s | $0.27 |
| f-compose | Haiku 5.5 | 2 | 3 | none; run 1 | 18 | 93 s | $0.03 |

Relay E: 39 turns, 320 s, $1.29. Relay F: 91 turns, 650 s, $0.34. Every K011 is the same refusal, a vector type written inline in `state` or a port (D023/D027, surfaced by the package loader as K011). e-swarm's three N004s were deliberate: it threw from `step` to see what the checker's probe sent (below). f-swarm's 21 runs after its first clean one were spent tuning: it read G016's note, "1 more agents … than without", as a failure.

The integrator's rechecks, `node scripts/seams-trial/check.js /private/tmp/UTdvE6-relay/<leg> --role compose`:

- **e-compose:** `hit → lure`, `at: bounce.box → swarm.ground, point, ×2 +0`. It drops seven fields and fills `strength = 1, duration = 2`. There are 13 records by T = 8, and 4 more agents within 40 of (192.7, 240) than without, 0.567 s after the record. The run replays.
- **f-compose:** `wallHit → lure` with `{ overflow: "keepLast" }`, `×1.5 +0`, drops three fields and fills `strength = 1`. S116 is a warning (512 records possible per swarm step against 16). There are 10 records, and 4 more agents within 30 of (136, 180), 1.05 s after the record. The run replays.

## What the contract got right

- **Per-Program state (ruling 2).** Every author wrote the same three pieces from `runtime.md`'s new section with no refusal: an `extensible` struct per item (`own`, `props`, `traits`), `environment(program)` returning `state` beside `objects`, and `init`/`step` copying the fields in and out. e-swarm: "`runtime.md` … told me everything … It was enough." f-bounce rated 3 because there were "three coordinated pieces", not because any was unclear. G017, the check that would catch the old drop-the-traits workaround, never fired.
- **Named kernels (ruling 1).** Both swarm authors used `kernels[`${part}.steer.${n}`]` over `Object.keys(record.steers)`. Nobody sorted `#n` ids.
- **Input field defaults (ruling 4).** Both swarm authors gave a defaulted field (`strength = 1`, and e-swarm `duration: f64@s = 2`) so that "a producer that only sends a position still works", which is the reason the rerun asked for them. Both wires filled them.
- **The null record global (ruling 6).** Both swarm authors added a record-reading slot of their own (`heed`, `answer`), guarded it with `== null`/`!= null`, and set the global to null outside a record.
- **`$T` (ruling 3).** e-swarm timed its lures from `$T`. f-bounce, not knowing about `$T` from the producer side, added a `t` field to its record anyway. f-compose then listed "`$T` is not among its keys" as a gap, which is wrong: it misread "not among its keys" as "not readable".
- **The overflow policy (ruling 7).** f-compose predicted S116 from `runtime.md`'s rule before its first run and wrote `{ overflow: "keepLast" }` ("the crowd should answer the latest meeting"). This is relay D's dead end, now closed by a composer. It passed only because of a checker fix made in this leaf (below).

## Where the docs misled, and what the checker got wrong

1. **`types` is not in the packet** (e-bounce, e-swarm, f-swarm). `seams.md` says a point input "reads as your one `vector` type" and pairs `point2` with "a `vector(2, "f64")` type", but never says where a type is declared, and the starting packages have none. The D023/D027 fix line got each author through in one run. **Fixed in the packet** after the runs: `seams.md` now shows `types: { <vec>: vector(2, "f64") }` and says to name it afterwards.
2. **The probe ignored defaults** (e-swarm, a harness bug). The swarm checker's probe sent 1 for every number, defaulted fields included. e-swarm had declared `radius: f64@ground = 10000` to mean "no limit", got `radius: 1`, failed G016 three times, found out by throwing from `step`, and removed `radius` from its design. That design change is the one massage this relay forced, and the harness forced it, not the kit. **Fixed:** the probe now sends only the fields with no default and leaves the defaults for the wire to fill, as a stranger's producer would (`withoutDefaults` in `checker/runs.js`; `test/legs-bounce.test.js` holds it). Before that, the probe also crashed outright on any input with a default (D028 on its copied output seam). That bug was fixed while building the reference hand-ins, before the runs.
3. **Warnings counted as violations** (a harness bug, found before the runs). S116 under an `overflow`, S206 and the N001 that counts drops all failed a leg, so f-compose's correct glue could not have passed. They are now `(warning)` note lines. Their `fix:` line was dropped until after the runs (e-compose noticed), and it is kept now.
4. **S206 is not in `seams.md`'s table** (e-compose). **Fixed** in the packet.
5. **G016's margin and wording** (f-swarm). G016 passes at the first instant with more agents near the point than without, which was 1 or 2 agents in every swarm leg. f-swarm read "1 more agents … at T = 1.25" as weak, and spent 21 runs tuning. Not changed here. Recommend that the note report the peak over the window and say plainly that it passed.
6. **`reference.md` already gives each output's Event max** ("Its runtime pushes at most 128 records per step"), but e-compose looked for it in the note and missed it. Minor. A table or a separate line would be easier to find.

## Gaps the agents named (smallest first, deduplicated)

**Authors:**
- A field's range (`strength` −1 to 1) lives only in a note (e-swarm).
- How `record.<slot>` looks for a `data({ … })` slot (`record.ground.width`) and for a root's ids, inferred from the Grammar (f-swarm, f-bounce). `runtime.md`'s record bullets don't cover a data shape.
- No way for an author to see their own run (state over time, values pushed), short of throwing from `step` (e-bounce, e-swarm).
- **The Event max is one static number** (e-bounce, f-bounce). A three-ball Program declares the 64-ball worst case (128, 256), so every consumer meets S116 and needs `overflow` (f-compose did). The rerun and relay D raised the same gap. Program-derived maxes are backlogged ([backlog](backlog.md), "Event maxes derived from a Program"), to be un-parked when a policy loses events a composer needed. That did not happen here: f-compose was content to keep the newest 16.
- **A Program's own data can't reach a port** (e-bounce, f-bounce). A value output's `from` reads only the Dialect's state, so a ball's `knocks` can't be offered, and a port can't carry a per-Program field.
- No way to relate a 2-D frame to a 1-D frame of one axis (e-bounce offered `at`, `x` and `y` separately, and two 1-D frames).
- "Optional with no value" can only be written as a sentinel default (e-swarm).

**Composers:**
- **No constant on a wire** (e-compose, f-compose, and e-swarm from the other side). The glue can't set `strength: -1` or a longer `duration`; only the consumer's default fills. Both composers tuned their own Programs instead.
- No computed field (`impact` into `strength`): a wire never computes, by design.
- One stage only: the balls aren't drawn under the swarm (e-compose: "for this task that is the largest gap"). This is already ruled on in the draw-list draft (`FqsPVJ`).
- S206 can't be acknowledged (e-compose; see the kit bug below).

## Kit bugs, for the integrator to file

1. **S206 suggests a rename that is S251.** e-compose's wire drops `radius: f64@box` and fills `duration: f64@s = 2`. S206 calls them "the same kind of field" and suggests `rename: { radius: "duration" }`, but no edge joins `box` (2 dims) and `s` (1 dims). **Repro:** copy `scripts/seams-trial/runs/2026-11-26-runtime/e-compose/workbench.js` beside `e-bounce/bounce` and `e-swarm/swarm` in a fresh folder, then run `node scripts/seams-trial/check.js <folder> --role compose`. It prints `S206 (warning) … radius is the same kind of field`. Change the wire to `.wire(court.out.hit, crowd.in.lure, { rename: { radius: "duration" } })` and the check prints `S251 … no edge joins frames of different dims`. S206's "compatible" test (`kit/compose/analyze.js`, near line 204) should require a frame path between the two fields' frames, or the same untagged kind.

No other kit bug was found. The rest of what went wrong was the packet and the harness.

## The massage

**None by the integrator.** No hand-in was edited, and both compositions run on the packages exactly as their authors left them (checked with `diff -r` of each compose leg's `bounce/` and `swarm/` against its author legs). The one design change the relay forced was e-swarm dropping `radius`, which the checker's probe bug caused, not the kit. With that bug fixed, every recorded hand-in still passes: `node scripts/seams-trial/check.js /private/tmp/UTdvE6-relay/<leg>/<pkg> --role bounce|swarm`, no violations. The size of the massage (zero) is the finding: the runtime contract and the seams composed without help, in both models.

## Recommendations: what the design must change

1. **Teach `types` in kit/START.md and kit/API.md wherever a port or state needs a vector** (the placeholder packet is fixed). Three of four authors were refused once for it.
2. **Fix S206's compatibility test** (kit bug 1).
3. **Rule on a wire constant.** Two composers and one author asked for a way to set an input field from the glue (`{ set: { <field>: <value> } }`, data like `rename`, never computed). It is the same kind of fact as a default, and it belongs to the glue. This needs Ben's ruling, since "a wire never computes" is the line it would sit next to.
4. **Keep Program-derived Event maxes parked, but add this trial's evidence to the backlog item.** Every bounce author declared a worst case 20 to 40 times its Program's real one, so every wire from bounce meets S116. `overflow` handled it without losing anything the composer needed, so the backlog's un-park condition is not met. An `events.out.<port>` that may be a function of the record (`(record) => 2 * Object.keys(record.balls).length`) would remove the warning.
5. **Say how a Program's own data reaches a port, or that it can't.** Both bounce authors wanted to offer per-ball props. A port's `from` reading the extended state, or a ruling that this stays out, would settle it.
6. **Show the built record's shape for `data({ … })` slots** in `runtime.md` (one bullet), and have the checker print what its probe sent, so no author has to throw to find out.
7. **Make G016 and G023 report their peak margin** and say "passed" (harness only).

## Reproducing

- The legs: `PACKET=placeholder scripts/seams-trial/run.sh bounce|swarm /private/tmp/<job>-relay/<leg> <model>`, then `PACKET=placeholder scripts/seams-trial/run.sh compose /private/tmp/<job>-relay/<leg> <model> <bounce-leg> <swarm-leg>`. The models were `claude-sonnet-5-5` (E) and `claude-haiku-5-5` (F). The packet the legs read was the one at this leaf's branch before the post-run fixes (items 1, 2 and 4 above).
- The table: `node scripts/seams-trial/summary.js scripts/seams-trial/runs/2026-11-26-runtime/{e,f}-{bounce,swarm,compose}`.
- A recheck: copy a compose leg's `workbench.js` beside its two author legs' packages, then run `node scripts/seams-trial/check.js <dir> --role compose`, or `--role bounce|swarm` on a package folder.
- The checker's own tests: `node --test scripts/seams-trial/test/legs-bounce.test.js`.
