# controls-dogfood

The blind dogfood of the declared-Controls draft ([project/2026-11-27-controls-draft.md](../../project/2026-11-27-controls-draft.md)), leaf `822dDs`, 2026-11-27. The draft is not built, so each leg writes its declarations on paper against a placeholder reference, as the anchor dogfood's paper leg did ([scripts/m4-trial/anchor-dogfood](../m4-trial/anchor-dogfood)). Findings: [project/2026-11-27-controls-dogfood-findings.md](../../project/2026-11-27-controls-dogfood-findings.md). Records: `runs/2026-11-27/`.

## The legs

| Leg | Model | Task | Hand-in |
|---|---|---|---|
| `game` | Sonnet | a grid game: a pad and two buttons, a part played alone, a glue | `dialect.js`, `ui.js`, `preset-lines.js`, `glue-lines.js` |
| `synth` | Haiku | an FM synthesizer: notes from keys, on-screen and MIDI; three knobs; an envelope; `direct` latency | `dialect.js`, `ui.js` |
| `lens` | Haiku | a lens bench: a Grip with write-back, a text entry, a catalog picker, two tabs | `dialect.js`, `ui.js` |

Ben's rule: Sonnet plus at least one Haiku, never Opus, and at least one leg that is not a game. Each leg also writes `REPORT.md` (the sections of `rules.md`).

## Commands

```sh
node scripts/controls-dogfood/build-reference.js > reference.md       # the legs' reference, built from the draft
scripts/controls-dogfood/run.sh game  /private/tmp/<leaf>-game  sonnet  # a fresh folder under /private/tmp, never ~/.claude
scripts/controls-dogfood/run.sh synth /private/tmp/<leaf>-synth haiku
scripts/controls-dogfood/run.sh lens  /private/tmp/<leaf>-lens  haiku
node scripts/controls-dogfood/check.js /private/tmp/<leaf>-lens lens   # the paper checker (checks.md lists what it covers)
node scripts/controls-dogfood/save-run.js /private/tmp/<leaf>-lens round2-lens-haiku   # keep the run under runs/
```

`run.sh` makes the folder from `task-<leg>.md`, `rules.md` and the built reference, and starts `claude -p` there with `brief.md`'s text (no web, no agents, no MCP, no session). The reference is the draft without "Three workbenches" (the worked answers), "What retires", the build plan, the open questions and the rulings, with `latency: "audio"` read as `"direct"` (Ben's ruling) and the rulings that change the API applied. `build-reference.js` fails if one of its replacements no longer matches the draft, so a draft edit that moves a sentence is caught.

## Checking

`checks.js` is a prototype of the validation the build will do, over a hand-in's plain declaration objects: U014 to U020, S111 and S120 for a glue's text, seam fit by field text, `each` run on a sample record, Grip lambdas run on a sample item, targets checked against the addresses the sample Program has (`fixtures/<leg>.json`). `checks.md` lists every check per leg, which are scripted and which are by hand. `npm test` covers `checks.js` (`test/checks.test.js`). A paper checker follows the draft, not the build: where the draft is revised, change it here.

## Gotchas this folder hit

- A blind leg is started from a folder under `/private/tmp`, never `~/.claude`; `save-run.js` lists any file a leg opened outside its folder.
- A leg reads long documents with Read by offset, not `cat` (the brief says so).
- `runs/` is excluded from `tsconfig.json`: its hand-ins are candidate code.
