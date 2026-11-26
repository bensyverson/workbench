# Seams relay rerun on the real kit: findings

*2026-11-26, leaf `WnmLua` (M4, `SPPLaM`). The second relay of the seams design: two package authors, each blind to the other, then a composer, each a fresh `claude -p` session in its own folder outside the repo. This time the kit is real (kit/seam, kit/define's ports, frames and `defineRuntime`, kit/compose, kit/run), every leg runs headless, and the docs' worked example comes from an unrelated pairing (a step sequencer and a scoreboard's lamps), so the trial can show whether strangers' names meet. The first relay could not: its reference example was the task's own pairing ([its findings](2026-11-25-seams-relay-trial-findings.md), item 8). Packet: `scripts/seams-trial/` at `055a0b0` ([README](../scripts/seams-trial/README.md)). Records: `scripts/seams-trial/runs/2026-11-26/{a,b}-{maze,particles,compose}/`.*

## Verdict

**The seams hold.** Both relays finished clean on their first or second try at every leg, with no package edited by a composer, no hand conversion, a burst at the converted pickup, and an exact replay. In relay B the strangers' names did not meet (`at` against `pos`), and the composer found `rename` and used it without help. In relay A they met as written. Composers rated the task 1 and 2 of 5. **The runtime contract is where the agents struggled.** Authors rated 2, 2, 3 and 4, and almost every guess and gap they reported is about what a runtime is handed: the built record's shape, kernel ids for repeated slots, where per-Program data lives in a fixed `state`, and an Event's instant. That is where the design needs to change next. The decisions are queued for Ben under "For Ben" below.

## The runs

Launched with `scripts/seams-trial/run.sh <role> /private/tmp/WnmLua-relay/<leg> <model>`: the four author legs ran in parallel, then each relay's composer on its two authors' hand-ins. Checks are the agent's own `check.sh` runs. Each leg's `log.jsonl` holds one more line, from the integrator's recheck. Turns, time and cost come from each transcript's final result line.

| Leg | Model | Difficulty | Checks (codes before clean) | Turns | Time | Cost |
|---|---|---|---|---|---|---|
| a-maze | Sonnet 5.5 | 2 | 3 (clean from the first) | 10 | 116 s | $0.36 |
| a-particles | Sonnet 5.5 | 2 | 7 (G001–G004; N004 ×7, G008) | 15 | 149 s | $0.49 |
| a-compose | Sonnet 5.5 | 1 | 3 (clean from the first) | 17 | 75 s | $0.37 |
| b-maze | Haiku 5.5 | 3 | 3 (clean from the first) | 25 | 109 s | $0.03 |
| b-particles | Haiku 5.5 | 4 | 5 (G001–G004; N004 ×3) | 29 | 210 s | $0.06 |
| b-compose | Haiku 5.5 | 2 | 2 (clean from the first) | 19 | 93 s | $0.03 |

A smoke leg (particles, Haiku, run by relay-1 while it built the packet; `/private/tmp/WnmLua-smoke/particles`, not recorded in the repo) rated 4. Its report is cited below where it adds something.

## The three questions the leaf asked

**Did strangers' names meet?** Partly, and where they didn't, the kit's answer worked.

| Relay | maze's Event output | particles' Event input | On the wire |
|---|---|---|---|
| A | `pickup: Event<{ pos: point2@cell, vel: vec2@cell/s, score: f64, left: f64 }>` | `burst: Event<{ pos: point2@box }>` | met as written; `vel`, `score`, `left` dropped |
| B | `pickup: Event<{ at: point2@cell, left: f64, when: point1@s }>` | `burst: Event<{ pos: point2@box }>` | `{ rename: { at: "pos" } }`; `left`, `when` dropped |

A caution on relay A: all three particles authors (both relays and the smoke leg) and the Sonnet maze author chose `pos`, which is the field the docs' board example uses (`flash: Event<{ pos: point1@lamp, … }>`). The unrelated example still taught a field name. That isn't bad in itself, since a shared habit makes names meet, but it means relay A's match is weak evidence that strangers converge unaided.

> **Correction (2026-11-26, leaf `KTrmEL`):** the cause above is wrong for the particles side. The particles package already has a built-in per-particle field `pos` (`BUILTIN_FIELDS` in `particles.dialect.js`; lambdas write `p.pos`), and relay C's particles author, given docs with no worked example, still chose `pos` and said why: "It matches the particle's own `p.pos`". Only the Sonnet maze author's `pos` and the Haiku composer's `light-show` trace to the docs' example. See [the placeholder-docs findings](2026-11-26-placeholder-docs-findings.md).

Every author also kept its Event record to the position alone on the input side, for the reason given below.

**Was `rename` found and used?** Yes. B's composer compared the two records in `reference.md`, wrote `rename: { at: "pos" }` from seams.md's `.wire` section, and passed on its first check. S202 never fired. Nobody needed `delay`, because neither glue made a loop. A's composer explained correctly why not.

**What did the agents have to guess?** Almost all of it was the runtime, listed under "Gaps, by theme".

## What worked

- **Frames and `"fit"`.** Both composers related `maze.cell` to `particles.box` with `"fit"` and wrote no arithmetic. The checker's `wire …` line, which prints the scale, offset and dropped fields, was called useful for confirming the conversion (a-compose).
- **Time.** Both composers predicted from runtime.md when the burst plays relative to the pickup, and the run agreed. A's composer worked it out exactly: a pickup at T = 0.375 bursts at 23/60 ≈ 0.383, the particles' next step.
- **S116 queue bounds.** Both composers checked the bound themselves (4 pickups per maze step into 256 or 16) and were right.
- **Records reaching lambdas.** `record: { name, slots }` was used by a-particles (and the smoke leg) so a `spawn` lambda reads `burst.pos`. b-particles did not use it. Its report says the slot conventions for Event inputs aren't listed (gap 5).
- **Runtimes.** All four runtimes ran clean under development checks: no N003 (memory outside state) and no N005 (replay). The headless checks caught real bugs: seven N004 throws in a-particles and three in b-particles, each fixed by the author.

## Where the docs misled

1. **`edges` reads as a frame's key, and it is the Dialect's.** seams.md lists `edges(record)` as a bullet under the frame example, so the smoke leg wrote it inside a frame and got D030 ("frame 'unit' has no key 'edges'"), then dropped its second frame. kit/define has `edges` beside `frames` (`kit/define/ports.js`, `SEAM_KEYS`). Fix the doc's example, and have D030 say "edges is a Dialect key, beside frames" when it meets one inside a frame.
2. **"The root construct's own lambdas are also there by slot name alone."** True only for a slot called once. A slot without `once` gets `<instance>.<slot>#<n>`, so a root `update` written once in a slot that allows several is `fountain.update#9`, and `kernels.update` is undefined with no error (smoke leg). The `#n` counts every call the instance makes (`param`, `bounds`, `tick`…), not only that slot's, which runtime.md's `k.tone#1` example doesn't make visible.
3. **Packages cite files the leg doesn't have** (`docs/task.md`, `docs/ui-draft.md` in the starting packages' comments; b-compose). These are left over from the package trial's packet.

## Gaps, by theme (smallest first within each)

**The runtime contract** (all four authors and the smoke leg):
- The built record's shape is undocumented (`record.forces`, `record.fields`, `record.tick`): b-particles, smoke.
- How a vector or point looks at the runtime boundary: arrays in records and pushed Events, `.x` in lambdas (b-maze, b-particles).
- Whether `ctx.controls` always exists; that the D-pad is `controls.pad` is a host convention, not a kit fact (a-maze, b-maze). The glue can't say which part a control goes to (a-compose).
- What seeds `ctx.rng`, and how a language's own `.seed(n)` applies (a-particles).
- A default for an optional Grammar `tick` (b-maze invented 1/8).
- Kernel ids for a repeated slot are positional, so a runtime matches them to the record's names by order (b-particles, smoke, relay-1's reference hand-in).
- A listed record slot called without a record (a spawn by rate) throws when it reads the unset global; the runtime must set a stand-in (relay-1).

**State:**
- **A Program's own per-particle fields have no place in a fixed `state`.** `.field("heat", …)` is chosen per Program, but `state` is declared once by the Dialect. b-particles encoded fields as a capped name/value list. The smoke leg dropped them, so `heat` reset every step and a `kill` never ran, and no check noticed. This is the largest runtime gap.

**Events:**
- **A record carries no instant.** b-maze added `when: point1@s` itself, set from T.
- **Every field an input declares must come from the producer.** So all three particles authors kept `burst` to `pos` alone (no `count`, `strength` or `vel`), so as not to shut out producers. A composer therefore can't pass the pickup's `vel` or `score` to the burst (a-compose, b-compose).
- **An Event max is one constant.** It can't follow the Program (a maze whose walk distance the Program sets), and S116 makes a generous one costly for consumers (a-maze).
- **Ports are fixed by the Dialect.** A Program can't add a second `burst` channel for a second kind of happening (a-particles).

**Composition:**
- **One stage is shown.** The burst plays on a blank box with no walls or coins (a-compose: "the largest gap"). The draw-list draft (`FqsPVJ`) already rules on this: a root part composes the others' pictures.
- **No grid crosses.** No package can offer its level's walls (a-maze, b-maze); this is backlogged.
- **`"fit"` is the only scale-free relation.** There's no way to ask for a pixel size per cell independent of the box (b-compose; minor).
- **Acceleration can't be a tagged input,** because rates are per second only (a-particles; minor).

## The checker

- **G013 is fooled by a follow emitter.** A's composer noticed that its marker emitter's particles count toward "a burst near the pickup", so a system with a poor or absent burst could pass. G013 should count only particles born at or after the pickup's delivery. Filed with the doc fixes.
- G008 and G013's "near" is one converted cell. b-compose guessed it, but the rules don't say so.

## For Ben

Each of these changes what a package author writes, so each needs your ruling. Filed together as a decision leaf; the recommendations are mine.

1. **Kernels by name for repeated slots.** Recommended: `ctx.kernels` also keys each named call by the name it declares (`kernels["fountain.force.gravity"]`, or a `kernels.forces.gravity` group). Positional `#n` ids stay as the stable id.
2. **Per-Program state.** Recommended: a Dialect may declare a state member whose shape a Program's declarations extend (the `.field`s), checked against the built record, the way `environment(program)` already extends objects. The alternative is a documented name/value list pattern, which caps the field count and is ugly.
3. **An Event record's instant.** Recommended: the kit stamps each delivered record with its producer's T (read-only `$T`, beside `$rev`), so no author has to add a `when` field.
4. **Optional record fields on an Event input.** Recommended: an input field may declare a default (`{ pos: point2@box, strength: f64 = 1 }`), filled on the wire when the producer's record lacks it. A wire still never computes a value.
5. **Where controls go.** Recommended: a glue call `.control(part, name)` (or `.show` taking the controls' target), so a composer says which part the D-pad drives. The page sends to that part.
6. **Record slots without a record.** Recommended: the record global reads as absent (optional) outside a record-driven call, so a lambda tests `burst != null`. Today it throws.

The doc fixes above (`edges`, the root alias, record shape, vectors at the boundary, controls, seeding, the tick default) and the G013 fix need no ruling. They are filed as one leaf.

## What this changes in the plan

The seams design (ports, frames, renames, conversion, S diagnostics) can be treated as settled for M4, and the next dogfood should not re-test it. The runtime contract can't: the six items above should be ruled and built, and then a runtime-focused trial run. That trial should give authors a language whose Programs declare their own data, since that is where the static-state gap bites, and it should try a second package pairing so the `pos` priming is tested too.
