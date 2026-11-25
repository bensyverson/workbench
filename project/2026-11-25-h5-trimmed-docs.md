# H5 on the trimmed docs and the new brief: findings

*2026-11-25, leaf `O2lYL4`. A three-agent check of two changes made after [the H5 rerun](2026-11-25-h5-rerun.md):*
- *START.md + API.md trimmed to the non-obvious, 7,994 → 5,592 tokens, with nine topic pages in `kit/docs/` (`ca97be4`);*
- *the brief's rule that a refusal the API cannot express is reported, not built (`f4c16cb`).*

*Two `claude-sonnet-5-5` agents and one `claude-haiku-5-5` (Ben: three is enough), at `ca97be4`, with the same sheet, hidden set and tooling as before. Record: [`scripts/particles/h5/runs/2026-11-25-trimmed/`](../scripts/particles/h5/runs/2026-11-25-trimmed/).*

## Result

**All three built the language and match the reference exactly, with no parser.**
- **Score:** each scored accept 27/27 and reject 139/148. The misses are the seven excludes plus r06d and r08b, which are expected under the new brief.
- **No hand-written checks:** every hand-in is 226–262 lines, with 13–17 lines above `defineGrammar`, and none has a tokenizer. In the rerun, both Sonnet agents wrote 465–560 line parsers.
- **Blind:** no tool call named a repository path.
- **Topic pages:** every agent opened all nine.
- **Difficulty:** 2, 2 and 3, against 3 on every agent in the rerun. Each named what it could not say under Gaps (14, 13 and 9 items), as the brief now asks.

| Agent | Model | Difficulty | Turns | Time | Cost | Checker runs | First clean | Lines | Scored: accept / reject | Gaps listed |
|---|---|---|---|---|---|---|---|---|---|---|
| A | `claude-sonnet-5-5` | 2 | 17 | 272 s | $0.89 | 34 | run 1 | 226 | 27/27, 139/141 | 14 |
| B | `claude-sonnet-5-5` | 2 | 17 | 221 s | $0.80 | 17 | run 1 | 258 | 27/27, 139/141 | 13 |
| C | `claude-haiku-5-5` | 3 | 30 | 407 s | $0.29 | 10 | run 1 | 262 | 27/27, 139/141 | 9 |

How each figure was made:
- **Turns, time, cost, checker runs, first clean:** `node scripts/particles/h5/summarize.js <dir>`.
- **Score:** `node scripts/api-pilot/score.js <dir> scripts/particles/hidden --lang particles`, with the seven excludes (hidden/README.md) counted apart. The recorded copies score the same.
- **Lines:** `cat *.js | wc -l`.
- **Topic pages opened:** `grep -oE 'docs/[a-z]+\.md'` over each transcript.
- **Gaps listed:** the bullets under each REPORT.md's Gaps heading.

## What it says

- **The trim cost nothing measurable.** On a 30% smaller front door, all three were as accurate as the reference and needed fewer turns than the rerun's Sonnet agents (17 against 21–27). Every agent read every topic page, so progressive disclosure here meant reading in two steps, not skipping pages. That is fine for an 8,000-token whole, but it means this run does not show which pages a typical task can skip.
- **Changing the brief removed the parsers.** The workaround code is gone, and the gaps it hid are now reported. The rerun's figure to watch, lines of hand-written checks, is now about 15 per agent.
- **The run is small:** three agents on two tiers, on a task the docs were tuned on. It confirms the changes did no harm; it is not a new H5 verdict. The M3 findings' verdict stands.

## Not yet read

The three REPORT.md files, beyond Difficulty and the count of Gaps. Their gap lists are the input for the next API decision and are worth a pass before one.
