You are an independent design reviewer. Two teams are building related systems. Read both and tell the first team, "ours", what it should learn from the second, "theirs", and whether anything in theirs should change our approach. Be concrete and willing to say "nothing to change here".

## Your inputs (all in this directory; read nothing outside it, and do not search the web)

- `ours/proposal.md`: our proposal for the Workbench Kit, a kit for building domain languages (a JavaScript-subset parser, a typed IR, emitters to JS and GLSL, checks), each "workbench" being a language plus an IDE, an agent and a book in one browser page.
- `ours/architecture-synthesis.md`: the current shape of our architecture after a review, with rulings. It is newer than the proposal; where they differ, the synthesis wins. Links in both point to files you do not have; ignore them.
- `theirs/summary.md`: a summary of their system written by someone who read only their sources. Use it as a map, not as truth: it may be wrong or leave things out.
- `theirs/reports/`: three technical reports on their system (primary).
- `theirs/repo/`: their source, with design docs and implementation diaries under `theirs/repo/ttmp/2026/11/24/` (primary). Check the summary's claims against these where a recommendation depends on them.

What ours has built so far, in one paragraph (so you know what is real): a parser for a JavaScript subset; a typed IR with effects per statement, a verifier and a reference interpreter; lowering from source to IR against an "environment"; a JS backend and a GLSL backend with a comparison harness (interpreter vs JS vs GLSL, with a tolerance, and planted-fault sensitivity); read-only queries over the IR; a "Definition API" that declares a Dialect (types, intrinsics with per-target spellings and a reference implementation, slot conventions) and a Grammar (constructs and slots) as data and generates a fluent builder; three Dialects (a game one, a shader one, a data-table one). Fresh agents are regularly given our docs and asked to build a language with the kit, as the test of the design. Per-slot effects (a lambda changes only the instance it is handed; shared totals only by commutative bumps) are drafted, not built. There is no pass manager, no optimization, no provenance across rewrites, and no strategy layer.

## What to write

Write `review.md` in this directory (your Write tool; a shell heredoc if refused). 3,000 to 6,000 words:

1. **The two systems in one paragraph each**, as you understand them: what problem each solves. Say where their goals differ, since that decides what transfers.
2. **What to adopt.** Ideas, mechanisms or disciplines from theirs that ours should take, each with: what it is in theirs (with a file path or report section), what problem of ours it solves, the smallest version that would pay off now, and the cost. Rank by value to ours.
3. **What should change in our approach,** if anything: premises in our proposal or synthesis that their experience contradicts or weakens, with the evidence. "Nothing" is an acceptable answer for any part.
4. **What not to adopt,** and why: things that fit their goals (an optimizing compiler to one CPU) but not ours.
5. **Where ours is ahead or chose differently on purpose,** briefly, so the comparison is fair.
6. **Risks their reports reveal** that ours will meet too (bugs they found, places their checks failed to catch something, performance walls).
7. **Questions** you could not settle from the inputs.

Name a source for every claim about either system. Mark inference as INFERRED.

When done, reply with the ranked list of section 2's headings, one line each, and section 3's verdict in one sentence.
