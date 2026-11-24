# H3 trial results: typed operators against call style

*2026-11-23. The fresh-agent run for H3 ("typed operators make shader code pleasant without confusing authors"), job vkQDxc. The comparison of the two styles on the survey sketches is in [h3-styles-comparison](2026-11-23-h3-styles-comparison.md); the trial kit is [scripts/h3-trial](../scripts/h3-trial/README.md).*

## What was run

- **Agents:** 10 fresh agents with no repository context, 5 per style: 3 Sonnet and 2 Haiku each. The subject is models, so both tiers ran; the Haiku runs are the harder test.
- **Input:** one documentation packet per style (`docs/typed.md` or `docs/call.md`, with one complete example) and three prose tasks (`vignette`, `rings`, `kaleidoscope`), none given as code. Each agent wrote all three sketches and checked them with `scripts/h3-trial/check.js`, which lowers the Program and prints diagnostics verbatim.
- **Counted by:** `node scripts/h3-trial/classify.js <log.jsonl>` over the ten logs concatenated (32 checks in all; the logs live in the session scratchpad, not the repository).

## Result

| | typed | call |
|---|---|---|
| sketches written | 15 | 15 |
| valid on the first check | 14 of 15 | 15 of 15 |
| checks run | 17 | 15 |
| diagnostics | 2 (both L002) | 0 |
| from expecting plain-JS semantics | **0** | **0** |

- Both diagnostics were one Sonnet agent writing `u.TAU` for a `.const`; it fixed it on the next check. That is a documentation gap (the packet says a constant is "usable like a variable"), not a plain-JS expectation.
- No agent printed or compared a vector as an object, used `+` for concatenation, or mixed f32 and f64. The agents' own notes report nothing confusing about operators. They report ambiguity in the task prose (the unit of "a fraction of the half-height", what "multiply the ripple's contrast" means); every agent resolved those the same way.

## What this does and does not show

**Verdict: no sign of confusion, but the trial barely exercised the thing under test.** Only 4 of the 15 typed sketches used an operator on two vectors; the others did their arithmetic on scalar components (`vec2(x * c - y * s, …)`), as the book's own sketches do, and none of the 15 call-style sketches needed a vector function either. Tasks solvable with scalar math do not test typed operators. So the result is "typed operators did not get in the way", not "authors and models reach for them and succeed".

Other limits:

- **The tips leak across styles.** The L001 tip lists every callable name, including the call-style functions, in both styles, and operator-style L003 tips show operators to call-style agents. No agent triggered either, so it did not matter here, but a cleaner round needs per-style tips.
- **Call style is a convention.** The Dialect accepts operators in both; `check.js` only notes their use. No call-style run used one (0 notes logged).
- **Agents ran only the default sample pixels,** so "valid" means it lowers and gives plausible colors, not that it meets every sanity check in its task.
- **One round, ten agents, one task set.** Enough to rule out a gross problem, not to compare rates.

## Next

A second round that forces vector math: tasks stated in vector terms (a point, a direction, a rotation as a 2x2 applied to a vec2, a color mix of two vec3s), with an input that tempts plain-JS habits (arrays of numbers, `Math.hypot` on a pair, comparing two vectors with `===`). Filed under M2's findings leaf as the one open H3 item; per-style tips first.
