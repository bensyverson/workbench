# Handoff: pilot gaps built, particles sheet settled, effects framed

*2026-11-24, end of session. Starts after [the API-pilot handoff](2026-11-24-handoff-api-pilot.md) (`8b0f6a1`); this session's commits are `1add223..` HEAD. Ben was around and ruled throughout.*

## What happened

- **The pilot's design gaps are built** (`aa80fb3`, reviewed, with the seven lows fixed in `5167587`): `name(ns, { within })` (names unique within one instance), `data("number", { min, max, whole })`, and `required: true` on a child construct. API.md retires two pitfalls. The pilot reference still scores 12/12 and 21/21.
- **Review of last session's unreviewed commits.** `c189880` (scanner): two more high-class misreads (line terminators other than `\n`; a regex/division guess that flips template text). **Ben parked them** until a misread turns up in practice (backlog, "harden the module-scope scan"; `kit/parse/README.md` now lists the misreads honestly). The host error lost in `run()` is fixed (`6e4f3a7`). The pilot scorer (`81a0eee`) passed a run that scored nothing (fixed, `697e208`), and it now runs candidates out of process with declared reject codes (`6e4f3a7`). `--lang` was sound.
- **Small output fixes:** `AkBOlK`, `EwxjrV` and the checker's missing-file wording (`96d0076`).
- **Effects, framed.** Ben ruled particles as the stateful H5 domain, and draft → dogfood → build → run for effects ([plan](2026-11-24-particles-effects-plan.md), leaves `6VctPg`, `EZex6F`, `Tc0QRH`, `8vQJOw`, then `3Cd9hb`). The particles sheet was written, read by two blind readers (93 hidden programs, 27 + 81 open questions), and settled in one revision that adds **counters** (`scripts/particles/docs/settled.md`).
- **Shared state, three probes.** The DMG effects census (`node scripts/dmg-lower/effects-census.js`): 39 of 111 lambdas write world state, almost all from code that runs once; the one per-instance world write is a counter. The [app-DSL probe](2026-11-24-app-dsl-probe.md) (informed and blind designs of a reading-list app): every author lambda can be pure, with effects as values the host runs. The proposal now carries a marked correction: no document defined an effect conflict until now.

## Rulings (Ben, 2026-11-24)

- The design gaps 1–3 built, 4–5 and the composition `game.out` question backlogged; B002's extensions and the param-name rule confirmed (M3 plan, Rulings).
- Scanner hardening parked until a misread happens in practice.
- Particles is the domain; effects go draft → dogfood → build → H5 run.
- **Lambdas stay pure; the host owns shared state.** A per-instance lambda writes only the instance it is handed, emits verbs, and bumps counters; code that runs once may write freely.
- **Host implementations live somewhere, never handwaved,** in either of two ways: new code in **Bench** (Ben's name for the Runtime Subset, now in the glossary), lowered and portable; or a declared foreign JS module, trusted and accepted only by JS and in-page wasm. The precedent is form-skate's `Form.plugin` (`local/form-skate-workbench.html`). Recorded on `EZex6F`.
- Counters only on the particles sheet, no per-tick system lambda (Ben deferred to the main thread).

## For Ben's eyes

1. **Float bumps.** The reviser allowed `counters.name += <any number expression>`, deterministic because the host runs particles oldest first. A parallel target would sum f64s in another order, which is not bit-exact. The effects draft must say whether bumps are whole numbers only, or whether a target may reorder them.
2. **Forces may not bump counters.** This keeps "a force writes `p.vel` only"; a two-way door.
3. **The blind hidden-program update** finished and is integrated (27 accept, 133 reject).

## In flight at handoff

Nothing. The blind hidden-program pass finished after the handoff was first written; it is integrated and `6VctPg` is closed.

## Review

Reviewed this session: `c189880`, `98a9b21`, `81a0eee`, `aa80fb3`, each by a fresh reviewer. **Not reviewed:** `697e208` (scorer exit codes), `96d0076` (checker fix/tip, L010 tip), `6e4f3a7` (`run()` host error, out-of-process scorer), `5167587` (the review lows), and `scripts/dmg-lower/effects-census.js`. They are small; review `6e4f3a7` first, since the scorer decides the H5 run's headline.

## Prerelease

`npm run test:prerelease` at `12b7690` (2026-11-24): 16 tests, 16 pass, 0 fail, 38.8 s. Planted faults: JS 24/26 caught, GLSL 21/24, with the same five escapes as before.

## Next

1. `EZex6F`: draft per-slot effects. Its notes carry everything decided: intrinsic effect kinds, async as request values, host imports with an implementation per target (Bench or foreign JS), the form-skate precedent, counters and the float-bump question.
2. `Tc0QRH` (dogfood, three tiers), `8vQJOw` (build, reference, review), then `3Cd9hb` (H5).
3. Review the unreviewed commits above.
