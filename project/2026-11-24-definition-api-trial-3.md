# Definition API, dogfood trial 3: findings

*2026-11-24, leaf `bqYGEM` (criterion `vv2`). One Opus, one Sonnet and one Haiku agent defined the data-tools language with the Definition API at `04567fb`, from the packet in [`scripts/define-trial/docs/`](../scripts/define-trial/docs/) and nothing else, checked by the real builder through `run()`. This is the first trial on binding-time params, module-scope helpers and constants, and the required text view. Briefs: [`scripts/define-trial/trial-3-briefs.md`](../scripts/define-trial/trial-3-briefs.md). Hand-ins: [`scripts/define-trial/runs/2026-11-24-trial-3/`](../scripts/define-trial/runs/2026-11-24-trial-3/). Trial 2: [its findings](2026-11-24-definition-api-trial-2.md).*

## The result in one paragraph

All three hand-ins check clean as handed in, so the massage is zero lines again, and every agent confirmed the checker was live by planting a fault (L002, L011, B003 and others caught). **Binding time caused no difficulty:** all three wrote `.limit($.topN)` in its one form and read params inside lambdas as uniforms, and the Opus agent wrote a function-bodied Program that loops over a top-level `const` schema at build time to open one chart per numeric column. None hit B003, B004, B014 or B015. **Module-scope helpers went unused:** no agent wrote a top-level arrow, because the data-tools Dream Code never needs one, so the trial says nothing about B012 or B013 from a user's side. **The text view was not really tested:** two agents copied the packet's example almost word for word, and the Haiku agent printed the construct state (column types) instead of rows. Nothing calls `text()`, so no choice could be wrong. The packet misled them in five places, all fixed in this commit. The design findings sit one level up from trial 2's: the meaning of a table step lives only in the Dialect's hand-written `step`, which types columns and nothing else.

## The runs

| Agent | Model | Difficulty | Checker runs | First clean | Tokens | Tool calls | Time |
|---|---|---|---|---|---|---|---|
| A | Opus (`claude-opus-5-5`) | 2 | 8 | run 2 | 102,623 | 13 | 281 s |
| B | Sonnet (`claude-sonnet-5-5`) | 2 | 7 | run 2 | 89,681 | 8 | 144 s |
| C | Haiku (`claude-haiku-5-5`) | 4 | 4 | run 1 | 121,457 | 10 | 217 s |

Checker runs and first clean run: `node -e` over each `log.jsonl` (lines, and the index of the first `"ok":true`), as in trial 2. Tokens, tool calls and time come from the harness's completion report. All three recorded copies pass `node scripts/define-trial/check.js scripts/define-trial/runs/2026-11-24-trial-3/agent-x` with `no violations (the definitions and 10 examples checked)`. Every failing run after the first clean one was a planted fault (A's runs 4 and 6, B's 5, C's 2). The two first runs that failed were real: A's `C005` (its own function threw) and B's `D010` twice (finding 2) with `C007` (no examples yet).

## The three features

| Feature | Used | Misused | Worked around |
|---|---|---|---|
| Binding-time params | all three: `.limit($.topN)`; lambdas read `$.year`, `$.region` and others as uniforms. A: a build-time loop over a top-level `const` (example 6) | none. A read "folded" as "does not follow the control" (its example 4 report), and the packet now says a folded param rebuilds | a date param's value is a millisecond number (A, C) or a string typed by `environment` (B). No date param shape exists |
| Module-scope helpers and constants | A: one baked `const` (example 6's schema), read by build-time code only. No top-level helper anywhere | none | none |
| The text view | all three wrote one (D020 requires it) | C's prints column types, not rows, against the packet's "a table as rows" | A and B copied the example |

## Where the packet misled them (quoted from it, now fixed)

- "Every key is optional except `name`, `numberType`, `spaces`, `targets`, `slots` and `text`": the key list above it had no `params` key, though the Params section uses one (A, B). The key list now has it.
- `const source = program.source?.[opened.from];` in the construct-state example: `program.source` was never explained (B and C guessed; C avoided it). A comment now says it is a root decl slot's record key.
- "`suggest` a list of candidates for a 'did you mean'": A wrote its own did-you-mean as well and got it twice. The packet now says the kit appends one.
- "It is **not a constructor**": B read this as no way to make a date in a lambda. The packet now names the intrinsic pattern (`dateOf(y, m, d)` returning `date`), which the data Dialect uses.
- "Changing it means building again": A took a folded param as frozen. The packet now says the host reruns the function, so the param still follows its control.

Not changed: `list`, `queries` and `conversions` are listed without a description (A). They are optional and the data-tools language needs none of them. Describing them would cost tokens the packet should keep for H5.

## Design findings

1. **A table step's meaning is only its typing** (A, C; the hardest part for both). Intrinsics carry a `ref`; a construct's `step` moves column types and nothing says what `join`, `pivot` or `dropNulls` do. This is trial 2's H2 figure seen from the author's side (the IR carries about 8 of 21 table operations). It is an input to the M3 findings, not a new leaf.
2. **D010 blocks a child construct's own helper slots** (B): `fn` and `const` on both `program` and `table` clash, since a child has every parent method. This is as designed. Filed in the backlog with what would un-park it.
3. **A lambda that returns a string naming a column is unchecked** (A, B: `.y(() => $.metric)`, a nonsense column string accepted). A convention whose return is a ref into the state's names would check it. Filed in the backlog.
4. **A param's options cannot be typed from a table** (A, C: `from: t => t.sales.distinct("region")`), and numeric `options` type as `f64`, not an enum (C). These are the build-time-lambda gap R8 already rules out.
5. **The text view is untestable as built**: nothing calls it, and the packet's one example is copyable. It gets a real test when a workbench page or an agent tool calls it (the composition or the hello pilot), not before.

## Verdict for `vv2`

The dogfood ran before freezing and reported. Binding time is frozen as built: three agents on three tiers used it correctly, with no refusal and one misreading, now fixed in the packet. Module-scope helpers are kept as built but are **not dogfooded by use**: no agent needed one. The `hello` pilot (leaf `qwgSOL`) should include a Program with a top-level helper, so a fresh agent meets B012 on purpose. The text view remains required, with its behavior untested (finding 5).

## Hand review

Read by the integrator: every agent's `data.dialect.js` and `data.grammar.js` text view, every example's export line, and the use of `$` and top-level bindings across all 30 examples (by `grep`, then by reading A's example 6). Not read line by line: the three `step` implementations, whose correctness the checker only verifies as typing (finding 1).
