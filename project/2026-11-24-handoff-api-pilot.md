# Handoff: binding time frozen, START.md and API.md written and piloted

*2026-11-24, end of session. Starts after [the data-Dialect handoff](2026-11-24-handoff-data-dialect-landed.md) (`04567fb`); this session's commits are `e0d99fc..` HEAD. Ben was around for the qwgSOL rulings.*

## What happened

- **Dogfood trial 3** (`e0d99fc`, [findings](2026-11-24-definition-api-trial-3.md)): one agent per tier (Opus, Sonnet, Haiku) on binding time, module scope and the text view. Zero massage. Binding time was used correctly by all three and is **frozen as built**. No agent needed a module-scope helper. The text view is required, but nothing calls it, so it went untested. Five packet fixes. Leaf `bqYGEM` is closed (6Nx was judged met by `bindingText`: binding time is a Program-level fact, and a Kernel only ever sees a uniform).
- **Two review rounds on the scanner and params.** The review of `04567fb` found a high bug: a regex after `)` let a closure become a helper reading the wrong binding, silently. It was fixed in `c2845ca`, with a new lexer, `kit/parse/blank.js`, that fails closed: a duplicate top-level name is a ScanError. The review of `c2845ca` found no high bugs, but a quadratic slowdown and four lows, fixed in `c189880`.
- **The API pilot kit** (`98a9b21`, `81a0eee`): `check.js --lang <name>`, a budget-planner Dream Code sheet, 33 hidden programs (written blind from the sheet), a reference implementation and `score.js`.
- **`kit/START.md` and `kit/API.md`** (`ca06ede`, revised in `bb8ed74` and this commit): signatures, one worked example, and pitfalls drawn from what misled agents. About 15k characters, against the define-trial packet's 42k.
- **The pilot** ([findings](2026-11-24-api-pilot.md)): Opus, Sonnet and Haiku each passed **33/33 hidden programs** from the documents alone, with no kit source read and no builder hand-written. A Haiku rerun on the revised API.md scored 32/33. The miss was a sheet ambiguity, now fixed, and the rerun's two record-shape discoveries are now in API.md.

## Rulings (Ben, 2026-11-24)

- No separate `hello` Dialect: API.md carries the worked example. As built, the example is one made-up sales language covering every part, not cut-down fields. Ben saw this decision but has not ruled on it.
- The pilot builds a new mini-language. Its hidden programs are written first, blind.
- Compress: signatures plus pitfalls, with no code table beyond the codes an author meets.

## For Ben's eyes

1. **Design gaps the pilot surfaced** (findings doc, "Design gaps"). All three agents asked for a **per-instance namespace** (`name("flow", { within: "account" })`). Two asked for ranges on data shapes, and two for a required child construct. These are decisions for you; nothing is filed as work yet.
2. **The token count is not measured.** Leaf `qwgSOL`'s criterion `qge` is pending until an API key is available for `count_tokens`. The plan is to count each file and the sum, and state the command.
3. **Still open from the last handoff:** B002 also refuses a top-level name that clashes with a Program's own `.fn`/`.const`, and fires on unread top-level bindings; the composition checker's `game.out` question; `constructor`/`valueOf`/`toString` legal as param names.

## Review

Reviewed this session: `04567fb` and `c2845ca`, each by a fresh reviewer, with findings fixed. **Not reviewed:** `c189880` (the second round of scanner, params and C001 fixes: production code, read by the integrator only), `98a9b21` (the checker's `--lang`) and `81a0eee` (the scorer). Review `c189880` first; the scanner fails closed but is subtle. Kept probes are in `local/rev-04567fb-probes/` and `local/rev-c2845ca-probes/`; the second folder also holds a TypeScript-parser differential oracle (`oracle.mjs`, `explore.mjs`), worth keeping as a test.

## Prerelease

`npm run test:prerelease` at `bb8ed74` (2026-11-24): 16 tests, 16 pass, 0 fail, 37.5 s. Planted faults: JS 24/26 caught, GLSL 21/24, with the same five escapes as before.

## Next

1. Measure the tokens and close `qwgSOL` (or record the overrun).
2. Review `c189880`, `98a9b21` and `81a0eee`.
3. Ben's call on the design gaps above, before `3Cd9hb` (the stateful fourth domain, the real H5 run). The pilot's machinery (`--lang`, `score.js`, a blind hidden set, the run record) carries over as is.
4. The three output-quality leaves (`AkBOlK`, `AitCG4`, `EwxjrV`) are small and suit one Sonnet agent.
