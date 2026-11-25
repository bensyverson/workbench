# Definition API, dogfood trial 4: per-slot effects on particles

*2026-11-25, leaf `PpcJQr` (under `Tc0QRH`). One Opus, one Sonnet and one Haiku agent defined the particles language ([the sheet](../scripts/particles/docs/dream-code.md)) from the Definition API packet plus the effects draft ([`api-effects.md`](../scripts/define-trial/docs/api-effects.md)), the first trial of a design that is not built. The checker ran in `--effects` mode, a stand-in that checks the draft's declarations and each lambda's effects against its slot's `may` ([`scripts/define-trial/README.md`](../scripts/define-trial/README.md)). Setup and brief: [`trial-4-briefs.md`](../scripts/define-trial/trial-4-briefs.md); hand-ins: [`runs/2026-11-25-trial-4/`](../scripts/define-trial/runs/2026-11-25-trial-4/). The design is [the effects draft](2026-11-25-per-slot-effects-draft.md).*

## The result in one paragraph

**The effects design held: no agent misused it, worked around it or asked for more of it.** All three said its per-slot `may` lists matched the sheet's lambda table "almost one to one", and all three hand-ins check clean as handed in (massage: zero lines). Every refusal they wrote fails, and five of the six take the code the agents expected (L004, L013, L017). The difficulty came from the sheet asking for more than the kit enforces, outside effects: a stricter syntax, no aliasing of handles, custom messages for unknown members, and some builder checks. **Run against the blind hidden set, agent A's hand-in, unchanged, scores 27/27 accepts and 118/133 rejects.** None of the 15 misses is an effects miss. They are the H5 run's real risk, and they need a ruling (below). The trial also found a kit bug that failed open: an assignment to a Dialect global (`$ = 1`) lowered clean, and the statement vanished from the Kernel. It is fixed.

## The runs

| Agent | Model | Difficulty | Checker runs | First clean | Tokens | Tool calls | Time |
|---|---|---|---|---|---|---|---|
| A | Opus (`claude-opus-5-5`) | 2 | 7 | run 1 | 108,481 | 12 | 239 s |
| B | Sonnet (`claude-sonnet-5-5`) | 2 | 30 | run 1 | 100,415 | 14 | 147 s |
| C | Haiku (`claude-haiku-5-5`) | 3 | 4 | run 2 | 156,927 | 22 | 325 s |

Checker runs and first clean run: `node -e` over each `log.jsonl` (lines, and the index of the first `"ok":true`). B's 30 runs are mostly throwaway one-mistake probes, as are A's "about 30" (A deleted its probes between runs). Tokens, tool calls and time come from the harness's completion report. All three recorded copies pass `node scripts/define-trial/check.js scripts/define-trial/runs/2026-11-25-trial-4/agent-x --effects --lang particles`.

**Hidden set:** `local/t4-hidden/` held agent A's two definition files and every program in `scripts/particles/hidden/` as an example, checked with `--effects --lang particles --json`; an accept passes with no error, a reject with an error other than C001, LOAD or C005 (the scorer's rule since `7e2ba59`). B's and C's hand-ins were not run against it.

## The effects decisions

| Decision | Used | Misused | Worked around |
|---|---|---|---|
| Instance spaces (`instance: "Particle"`) | all three: one `particle` space for spawn, force and update, rate in a pure space | none | none |
| `may` with prefix match | all three wrote the same four lists: rate `["read Counters"]`, spawn `["write Particle", "rng", "bump Counters"]`, force `["write Particle.vel"]`, update `["write Particle", "destroy Particle", "bump Counters"]` | none | none |
| Per-member writes (`write: true`) | all three; `age` left read-only, so a write to it is L013 "for free" (A) | none | none |
| Verbs and callable objects | all three: `kill` with `effects: ["destroy Particle"]`, `Rng` with `call` and `effects: ["rng"]` | none | none |
| Totals (`bump: true`) | all three, added per `.counter` by `environment(program)` | none | none |
| Helpers read only instances | A wrote `helpers: { may: ["read Particle"] }` explicitly; B and C relied on the default | none | none |

Where they found the draft's edges:

- **A helper that reads a counter gets two diagnostics:** L004 at the helper and L017 at the update that calls it (A, B; probed). One mistake, one diagnostic: the build must report it at the helper only. The L017 also spells the total `Counters.burnedOut`, not `counters.burnedOut` as written (A).
- **"`+= <number>`" read as a literal** (A feared it meant one). The packet now says any number expression.
- **Aliasing is harmless but accepted** (`const q = p`, `const r = rng; r()`): the draft says so on purpose; the sheet refuses both. See "For Ben".
- **The sheet's counter mistakes split across two codes** (L017 for a read in update, L004 for a bump in rate); all three found that fine.

## Where the documents misled them (fixed)

- **`api-draft.md` had no number bounds.** `data("number", { min, max, whole })` was built last session and is in `kit/API.md`, but the trial packet never got it, so all three hand-wrote range and whole-number checks (A's R001–R008, B's K001–K010, C's Q001–Q010). The packet's Shapes paragraph now has it.
- **`params: { slot: "param" }` and the record key** (C): a plain slot records under `param`, not `params`, so every `$` member went missing until C added `as: "params"`; the prose never ties the two. To fix in the packet with the next revision.
- **A construct's opening `name()` "is a label"** (A), yet the kit refuses two emitters with one name (B002). A wrote, then removed, a duplicate check of its own.

## Kit findings

1. **Fixed: an assignment to a Dialect global lowered clean and vanished** (A: "`$ = 1` inside a lambda checks clean"). `writableLocal` in `kit/lower/assign.js` resolved the target as a read, which reports nothing for a global, and returned null; the statement became `bad()` with no diagnostic, and the Kernel was made without it. It now is L013 ("a global of the language"), for `=`, compound assignment, `++` and an assignment used as a value (`kit/lower/test/assign-global.test.js`, red then green).
2. **B013's message is wrong for another lambda's parameter** (A, C): `rng()` in update says `rng` is "declared only inside build-time code", because the free-name rule scans the file and finds spawn's parameter.
3. **A recursive helper gets L007 at the helper and L014 at its caller** (A): two diagnostics for one mistake.
4. **`data("number")` accepts `Infinity` and `NaN`** (hidden r22d, r22e). A record should hold finite numbers only.
5. **An export that returns `{ program: sys }`, or calls `particles` twice, checks clean** (hidden r22p, r22q). `run()` should refuse a function that returns no builder; to probe whether the kit or the checker lets these through.
6. **`function name() {}` helpers are B007** (A); the sheet accepts them. No hidden accept uses one.
7. **`for (let k = 0; k < $.n; k++)` is L007, "not a param"** (A): a Definition API param is a member of the params object, not a lowering `param`, so it cannot bound a loop. Matches the sheet (R21), but the message is wrong.

## What the hidden set misses, and what it needs

| Group | Hidden rejects | What would refuse them |
|---|---|---|
| A handle used as a value | r02e (`const q = p`), r07e (`rng` passed to a helper), r21k (`const s = $`), r25c (`const c = counters`) | an object option that a handle is used only as `h.member`, `h.verb()`, `h()` or a whole helper argument (B: "`noAlias: true`"); for globals, refusing a global object bound to a local outright |
| The sheet's narrower syntax | r21b (`==`), r21c (a string), r21s (`**`), r21u (an array), r21l and r21n (a local named `vec2`, a parameter named `Math`) | a Dialect declaration that narrows the Runtime Subset (no loose equality, no strings, no arrays, no `**`) and reserves its global and intrinsic names from shadowing |
| Builder holes | r22d, r22e (non-finite), r22p, r22q (export shape) | kit fixes 4 and 5 above |
| A lambda through a variable | r22l | a lambda slot that takes only an arrow written in place (C); the record keeps text, so the builder would have to see the call's argument |

## For Ben

1. **The 15 hidden rejects the kit cannot refuse** are the decision before the effects build (`8vQJOw`) and the H5 run. Options: **(a)** build the two small Dialect declarations (handle use, and a narrowed subset with reserved names) plus the two builder fixes, which covers 14 of 15; **(b)** mark the 15 as outside H5's scope, since the sheet asks for more than the API offers; **(c)** loosen the sheet, which invalidates blind hidden programs. **Recommendation: (a) for the builder fixes and the handle rule (each closes a real hole), and (a) or (b) for the syntax narrowing, your call:** it is the largest piece, and the question is whether a Dialect should be able to narrow the Runtime Subset at all.
2. **The effects design needs no change from the trial** apart from the one-diagnostic fix for a helper reading a total, and two wording fixes. It is ready to build once (1) is ruled.
