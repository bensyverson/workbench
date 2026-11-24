# H3 trial kit

The second half of H3 ("typed operators make shader code pleasant without confusing authors"): fresh agents are given only a documentation packet for the fields Dialect, in one of two styles, and write three sketches. Every run of the checking tool is logged, and the log is tallied by diagnostic, separating the errors that come from expecting plain-JS semantics from the rest. The comparison of the survey sketches in both styles is [project/2026-11-23-h3-styles-comparison.md](../../project/2026-11-23-h3-styles-comparison.md).

## What is here

| Path | What |
|---|---|
| `docs/typed.md`, `docs/typed-example.js` | the packet for the **typed-operator** style: `uv * 2.0 + vec2(u.t, 0)` is vector arithmetic |
| `docs/call.md`, `docs/call-example.js` | the packet for the **call** style: vector math only through `vadd`, `vsub`, `vmul`, `vdiv`, `vscale`, `vneg` |
| `tasks/vignette.md`, `tasks/rings.md`, `tasks/kaleidoscope.md` | the three sketches, in prose only |
| `check.js` | the agent's tool: `node scripts/h3-trial/check.js <typed\|call> <sketch.js>` |
| `classify.js` | the tally: `node scripts/h3-trial/classify.js <log.jsonl> [--json]` |
| `test/` | the kit's tests, and `test/solutions.js`, typed reference solutions to the three tasks (not given to agents) |

Each packet holds only what its style needs, and neither mentions the other, nor kit internals (IR, Kernels, lowering). They are derived from [the fields Dialect's README](../../kit/dialects/fields/README.md), which describes the typed style.

## A sketch file

A JS module that starts `import { field } from "fields";` (the tool supplies that name) and `export default`s a Program built with `field(...)`; see the example in each packet. The pixel code is a string, because it is lowered, not run.

## Running a trial

1. Pick agents and sketches. Suggested design: for each style, N fresh agents each write all three sketches (so every agent meets every task, and each task is written once per style per agent). The packets and tasks are the only documents an agent should read; tell it not to open anything else in the repository.
2. Give each agent a private directory for its sketch files and its own log: `H3_LOG=<dir>/log.jsonl` must be set in the environment of the agent's shell, so the agent need not know about it. Agents run `check.js` as often as they like.
3. After the runs: `node scripts/h3-trial/classify.js <dir>/log.jsonl` for one agent, or concatenate the logs (`cat */log.jsonl > all.jsonl`) for all. It prints, per style, the invocations, diagnostics by code, how many come from expecting plain-JS semantics (and which kind), and for each sketch how many checks it took to the first success.

## What the log holds

One JSON line per `check.js` invocation: `time`, `style`, `file`, the file's `source` at that moment, `ok`, `loadError`, `diagnostics` (where, code, severity, message, tip, line, text), `styleNotes` (call style only: an operator applied to a vector), and the sample pixels. The `source` field lets the main thread read what the agent tried between checks.

## What counts as expecting plain-JS semantics

`classify.js` decides by code and message (the rules are `RULES` in the file):

| Code | Message pattern | Mistake |
|---|---|---|
| L003 | `takes two vec2s, not a vec2 and f32` | an operator on mismatched types (`uv + 1`, `p * q` with a vec3 and a color) |
| L003 | `does not compare vectors`, `does not order vectors` | `==`, `<` on vectors, or a vector as a condition |
| L003 | `needs numbers or vectors, not "a" and vec2` | `+` as string concatenation or on non-numbers |
| L003 | f32 with f64, or two vector types | number-type or vector-type mixing |
| L003 | any other message about a vector operator | `%`, `**`, bitwise on a vector |
| L001 | `'Math' is not declared here` | `Math.PI`, `Math.sin` |
| L002 | `vec2 has no member 'xy'` | a swizzle or `.length` |
| L015 | `vec2 got 1 argument` | a splat or a vector given to a constructor |
| STYLE | (call style) an operator applied to a vector | the call style's own rule broken |

Everything else is "other": parse errors, `dot` and other names the Dialect lacks (L001 for a name that is not `Math`), loops (L007), helpers (L014), `LOAD` errors (the file does not run or exports no Program). The classification is by pattern, so read the per-template counts (`classify.js` prints them) before quoting a total.

> **Changed 2026-11-24 (leaf iJtvVE):** `field` is now the builder the Definition API generates, which refuses a name the lambda cannot see (`Math`, `dot`; `B008`) and a lambda that does not parse (`B007`) when the sketch's `.build()` runs, before `check.js` lowers it. A rerun of this trial therefore logs those as `LOAD` errors, not L001 or parse errors, and the `Math` rule above no longer fires; `B008`'s tip suggests declaring the name with `.const` instead of naming the bare intrinsic. The 2026-11-23 results were taken with the hand-written builder. `test/trial.test.js` keeps the old expectation as a `todo` test until this is ruled on.

## Known confounds

- **The L001 tip lists the names a lambda sees, including `vadd`...`vneg`**, in both styles, because the call-style intrinsics live in the Dialect's `INTRINSICS`. A typed-style agent that triggers L001 learns the call functions exist. Fixing it needs the tip to list a per-style set (a change in `kit/lower`, or the Dialect passing a different intrinsic set); it was not done here.
- **The typed-operator tips are written in operator style** (`Build the vector: uv + vec2(u.k, u.k).`), so a call-style agent who triggers L003 on a vector operation is shown operators. The call style does not forbid operators; `check.js` only notes them (`STYLE`), and they still lower.
- **The agents' model** is the main thread's choice, and it matters: the subject is models. Record which model wrote each sketch and run both styles on the same one.
- A fresh agent can still read the repository (the kit's tests, the survey sketches in `kit/dialects/fields/programs`); tell it not to, and check its transcript.
- `dot` is not an intrinsic of the Dialect; the tasks avoid needing it, but an agent will probably try it. It counts as "other".
