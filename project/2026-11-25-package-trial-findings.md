# Package trial: three agents package maze and particles

*2026-11-25, leaf `bo1glT` (M4 Composition, `SPPLaM`). This is the dogfood pass on the [package format draft](2026-11-25-package-format-draft.md), as ruled, before the format is frozen. Fresh agents got the draft packaging reference (`scripts/pkg-trial/docs/packaging.md`), a rule set and a task, plus the loose parts of the two trial languages. Each packaged both languages under `out/` and answered three questions. Ben chose the models: two Sonnet and one Haiku, no Opus. The checker is kit/package's `loadPackage` plus the defineUI checks (`cbeb564`). Runs: `scripts/pkg-trial/run.sh /private/tmp/3d093c96-pkg/agent-{a,b,c} claude-{sonnet,sonnet,haiku}-5-5`. Records: `scripts/pkg-trial/runs/2026-11-25/`. Figures come from `node scripts/particles/h5/summarize.js <dirs>`.*

## Results

| Agent | Model | Difficulty (of 5) | Turns | Time | Cost | check.js runs | First run clean | Massage | Outside reads |
|---|---|---|---|---|---|---|---|---|---|
| A | Sonnet 5.5 | 2 | 9 | 79 s | $0.30 | 12 (incl. 2 deliberate breakages) | yes | none | none |
| B | Sonnet 5.5 | 2 | 8 | 69 s | $0.28 | 12 (incl. 2 deliberate breakages) | yes | none | none |
| C | Haiku 5.5 | 3 | 12 | 76 s | $0.02 | 4 | yes | none | none |

Each `check.sh` run is two `check.js` runs, one per package. All three agents chose the same layout: flat, with `examples/` as the only subfolder, because the UI's `module: "./particles-field.js"` and the examples' `../x.grammar.js` already assume it. No agent changed an import or a definition. **Packaging cost almost nothing, so the format's mechanics hold.** All the difficulty sat in what the format leaves unsaid.

## Where they converged

| Finding | A | B | C |
|---|---|---|---|
| **Refusal examples have no place.** `r01`–`r06` match the `examples` wording (a default `($) => Program`), so the key "seems to admit them". A and C hashed them as plain files; B left them out. All three proposed `refusals: [{ module, code }]`, checked by running each one | yes | yes | yes |
| **The hash check proves consistency, not origin.** The manifest is not hashed and travels with the files, so "the host does not run code from a package it cannot vouch for" promises too much | yes | yes | yes |
| **K006's fix is written for the author.** It names `node scripts/pkg/hash.js`, which a viewer of an upload does not have, and the reference says `./hash.sh` | yes | yes | yes |
| **Composition is unsayable**, as expected: no goal event in maze, no trigger in particles, fixed emitter positions, two coordinate spaces, two clocks, two `$`s and `t`s. This belongs with the seams leaf `hjdIRt` | yes | yes | yes |
| **Dotfiles.** A `.DS_Store` added to the package passed the checker, although the reference says every file in the folder belongs to the package. `readPackageDir` skips dotfiles silently | yes | yes | – |

Single mentions:
- Line endings or a byte-order mark would break a text hash (B).
- Whether `elements` must match the UI's `module` paths (C).
- Comments that point outside the package (A, B).
- Particles' UI declares `emits: ["pick", "select"]` but its element dispatches only `wb-pick` (A).
- An unguarded `customElements.define` would throw if two versions of a package load in one page (A).
- No rule for a first `version` (C).

## What changes

- **Ruled 2026-11-25 (Ben): add `refusals`**, a list of `{ module, code }`. The checker imports each one, builds its Program and requires that exact refusal code. It also builds each `examples` Program and requires it to be clean, so a package's examples become its regression suite, as the draft intended.
- **Calls made by the integrator (two-way doors):**
  - Dotfiles (any path part starting with `.`) are not part of a package, for the hash tool, the folder reader and `checkPackage` alike, and the reference says so.
  - K006's fix is worded for any host.
  - The content key also covers the manifest text, so a changed `entry` changes the key.
  - The reference stops saying "vouch for": the hashes catch accidental change, and pinning against tampering is the workbench lock's job.
  - The format stays text-only: files are hashed as UTF-8 text, and the reference says so.
  - `elements` must be exactly the set of modules the UI names, so the two cannot drift.
- **Parked:** the element's `emits` mismatch (a fixture issue, not a format one) and a `customElements.define` guard (it belongs to composition, `hjdIRt`).

> **Ruled 2026-11-25 (Ben): the import check uses a real parser.** Three reviews found ways past kit/package's lexical import scan (`d8b20fd` fixed the second round; issue `OBLXnA` holds the third round's four routes). Acorn (MIT, no dependencies, runs in the page) is vendored into kit/. Each package module is parsed as ESM, a module that does not parse is refused, and every import form is found in the tree. This is the repo's first runtime dependency, approved by Ben for this purpose only.
