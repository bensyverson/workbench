# Handoff: effects drafted and dogfooded, the handle rule, Manuel's IR Workbench

*2026-11-25, end of session. Starts after [the effects groundwork handoff](2026-11-24-handoff-effects-groundwork.md) (`487a2c1`); this session's commits are `cb2e6cd..` HEAD. Ben was around for the second half and ruled.*

## What happened

- **Per-slot effects, drafted** (`cb2e6cd`, leaf `EZex6F`): the packet addition [`scripts/define-trial/docs/api-effects.md`](../scripts/define-trial/docs/api-effects.md) and the design doc [2026-11-25-per-slot-effects-draft.md](2026-11-25-per-slot-effects-draft.md). Instance spaces, `may` lists of IR effect strings with prefix match, writable members, verbs and callable objects with `effects`, bump-only totals; own-instance enforced by reachability (D022). The float-bump question is answered by the target's compare mode (an `exact()` target keeps the reference order).
- **A trial checker for an unbuilt design** (`c982304`, leaf `HDwkdF`): `check.js --effects` checks the draft's declarations, strips them so the real kit accepts the rest, lowers against a patched Environment and checks effects after lowering. Building it corrected the draft three times (an object's `call` is new; helpers read only instance objects by default; a total read in a slot that bumps it is L017).
- **Dogfood trial 4** (`ecaae3e`, leaf `PpcJQr`): [findings](2026-11-25-definition-api-trial-4.md). Opus, Sonnet and Haiku built particles; difficulty 2, 2, 3; zero massage. **The effects design held.** Agent A's hand-in scored 27/27, 118/133 on the blind hidden set; none of the misses was about effects.
- **A kit bug that failed open, fixed** (`ecaae3e`): an assignment to a Dialect global (`$ = 1`) lowered clean and vanished from the Kernel; now L013.
- **The handle rule and builder holes** (`2eae282`, leaf `9IQ6uP`, Ben's ruling): L018 (a handed-in handle only as `h.member`, `h.method()`, `h()` when callable, or a whole call argument; a callable one only called), finite-only numbers (B004), B016 (a second root opened) and B017 (the export opens its root and returns something else). Hidden set now 27/27, 126/133; the other seven are out of H5's scope.
- **Scorer fixes** (`7e2ba59`, leaves `Mv42ME`, `UypdwY`, from a fresh review of last session's unreviewed commits): C001/LOAD/C005 never count as a refusal, a declared-code tally, one crash fails one program, forged results rejected, timeout overflow; plus the census labels and `an()`.
- **Manuel's IR Workbench** (Ben's request): a blind summary ([summary.md](2026-11-25-manuel-ir-workbench/summary.md)) and a blind consult against our proposal ([consult.md](2026-11-25-manuel-ir-workbench/consult.md)), each a separate `claude -p` outside the repo; an informed pass checks the consult against what we have ([informed.md](2026-11-25-manuel-ir-workbench/informed.md), see "In flight").

## Rulings (Ben, 2026-11-25)

- Fix the builder holes and build the handle rule.
- **No Runtime Subset narrowing per Dialect.** Hardware limits are per-target capability refusals and store rules; particles' bans are taste. Hidden rejects r21b, r21c, r21s, r21u, r21l, r21n and r22l are out of H5's scope (`scripts/particles/hidden/README.md`; note on `3Cd9hb`); backlog: "derive the subset from the declared targets".

## For Ben's eyes

1. **L018 also refuses comparing handles** (`other !== self`). Harmless to effects and a common game idiom; no DMG preset does it today. A two-way door: relax it when a Program needs it.
2. **The effects draft's remaining questions** (design doc, "For Ben's eyes"): host imports as a separate `imports` key (recommended) or effectful intrinsics; not needed for particles or H5.
3. **Manuel**: the consult's verdict is that our direction holds; read informed.md's short list.

## In flight at handoff

- The informed pass on the Manuel consult (`project/2026-11-25-manuel-ir-workbench/informed.md`), if not yet integrated when you read this: check the file exists and commit it.

## Review

Reviewed this session: `6e4f3a7`, `697e208`, `96d0076`, `5167587` and the census (fresh reviewer; findings fixed in `7e2ba59`). The integrator read every merged diff (`7e2ba59`, `c982304`, `2eae282`). **Not independently reviewed:** `c982304` (the `--effects` shim: trial tooling, to be replaced by the build) and `2eae282` (the handle rule, B016/B017, finite numbers: kit code, about 400 lines with tests). Review `2eae282` first, before the effects build lands on it.

## Prerelease

`npm run test:prerelease` at `3174768` (2026-11-25): 16 tests, 16 pass, 0 fail, 37.3 s. Planted faults: JS 24/26, GLSL 21/24, the same five escapes as before.

## Next

1. Review `2eae282`.
2. `8vQJOw`: build per-slot effects in kit/define and kit/lower from the draft as trial 4 left it (the one-diagnostic fix for a helper reading a total; L017 spelling the total as written), the IR's bump statement and a `value` store rule ([design doc](2026-11-25-per-slot-effects-draft.md), "What the IR lacks"); then retire the `--effects` shim; a reference particles implementation scored with the hidden set (excluding the seven).
3. `3YNVB3`: the remaining kit lows from trial 4 (B013's message, L007+L014 double diagnostic, function helpers, L007 wording; items 4 and 5 are done in `2eae282`).
4. Then `3Cd9hb`, the H5 run.
