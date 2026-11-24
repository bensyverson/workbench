# Definition API trial kit

The first dogfood trial of the Definition API (M3, leaf `lMNmIB`): fresh agents get only the draft API, a strict rule set and the data-tools Dream Code, define the data-tools language with the draft as far as it goes, and report where it failed them. The draft is not built; the trial runs on paper, checked by a script. The design behind the draft is [project/2026-11-24-definition-api-design.md](../../project/2026-11-24-definition-api-design.md).

## What is here

| Path | What |
|---|---|
| `docs/api-draft.md` | the draft Definition API, with the fields Dialect written in it as the worked example |
| `docs/rules.md` | the task, the hand-in, the rules R1–R9 and the checker's codes (`D…` for definitions, `C…` for examples) |
| `check.js` | *not written yet*: the checker the rules name. It becomes `check` v0 |

## Running a trial

Give each agent a private directory holding copies of `docs/api-draft.md`, `docs/rules.md` and [the Dream Code](../../project/2026-11-24-data-tools-dream-code.md) as `dream-code.md`, and the checker's path. Tell it to read nothing else in the repository. Record per agent the model, what it guessed, what it asked for, its difficulty score, and how much its output needed changing to comply (the leaf's notes carry the protocol).
