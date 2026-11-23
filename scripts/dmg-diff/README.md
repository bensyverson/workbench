# DMG differential run and lowering survey

M1's report numbers, reproducible. Two verbs over the [lowering pipeline](../dmg-lower/README.md) and the [oracle](../dmg-oracle/README.md):

```sh
node scripts/dmg-diff/cli.js survey            # lower all 22 presets; per-preset counts, then every rejection with its diagnostics
node scripts/dmg-diff/cli.js diff              # cases over presets 04-07, seeds 7, 11, 23, 3000 frames each
node scripts/dmg-diff/cli.js diff --case "04 sweep" --seeds 7 --frames 600
node scripts/dmg-diff/cli.js mutants           # planted faults in emitted lambdas, through every case of their preset
```

`--json` gives any verb's full result. `diff` exits 1 when any trace differs, `mutants` when a mutant not marked equivalent is missed; both exit 2 on bad usage.

- **Mutants** ([`sensitivity.js`](sensitivity.js), `MUTANTS`): textual faults in emitted lambdas, taken from the IR review's probe. A mutant no run can tell apart carries the reason it is equivalent under the host; any other miss is a gap in the cases.

- **Survey classes** ([`survey.js`](survey.js)). A rejected lambda is `helpers` when it uses a top-level binding of its preset (the inventory's `topLevelRefs`), whatever else is wrong with it; else `not-yet` when every error is a gap in lowering or the DMG dialect (L012; L002 for a member the dialect does not describe, such as string methods or `w.bg`; L015 on a query, which is `reduce` without an initial value); else `subset`. A fragment lambda counts once, and lowers only if it lowers for every part that runs it.
- **Differential cases** ([`differential.js`](differential.js), `CASES`). Each names a preset, live params, build-time overrides, or a textual edit of the preset's source, and says what it exercises. `04 linger 0 (edited)` is a test program derived from preset 04, not the preset: it makes the u16 wrap reachable. For each case and seed, every lowerable lambda is swapped for its emitted JS alone, then all at once, and each run's trace (state, log, RNG draws, framebuffer every 4th tick) is compared with the original's. The output also reports what the original run reached: ticks spent game over, host wrap warnings (deduplicated per attribute by the host), RNG draws.
- **Tests.** `test/dmg-diff.test.js` pins the survey's figures and runs one short case (fast suite). `prerelease/diff.prerelease.js` runs every case on three seeds for 3000 frames (`npm run test:prerelease`).
