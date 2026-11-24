# Handoff: the M2 review's fixes landed

*2026-11-24 · current only while no later commit follows the one that adds it. It supersedes [the M2-close handoff](2026-11-23-handoff-m2-close.md).*

## Where things stand

- **Job `piyiFx` is done**; `job orient` has no open leaf, and every M2 leaf now carries `reviewed`. An independent Opus reviewer found no serious problems in the fixes; its one medium and four low items were fixed too.
- **What changed:** a Dialect declares `Member.size` for the read-only places that may bound a loop (DMG grid rows and cols; fields params with `max <= 2^24 - 1`; a param default outside its range is refused); kept components of a rebuilt vector carry their own spans; the harness refuses a NaN tolerance, locates -0 mismatches, no longer counts a shader compile error as caught, and `faults` and `stress` exit nonzero on real problems (`faultProblems`); the JS emitter reserves helper names; the debugger page disables dither. The findings doc is corrected in place.
- **Figures:** `npm test` 779 pass (about 3 s); prerelease 16 of 16 (`npm run test:prerelease`, sandbox off for `sleepy`); `node scripts/dmg-diff/cli.js survey` still 126 / 111 / 7 / 4 / 4; `diff` 0 differences over 30 runs.
- **Job identity:** this checkout's database had no default identity after the pull; writes need `--as <name>` (or `job init --as`).

## Open for Ben (unchanged)

1. One GLSL tolerance or two (`GLSL_TOLERANCE` in `kit/harness/tolerance.js`; the stress case reaches 5.2e-3).
2. A second H3 round that forces vector math, with per-style diagnostic tips.
3. Whether to add `peep` image MAE checks to the harness.

## Known and left

- The CLI does not warn when a grid puts a pixel on a threshold (documented in the harness README).
- A kept-component span test only proves the text is not the assigned member; the debugger shows kept steps as the bare vector name.

## Next

M3 is not planned. Inputs are listed in the findings' "What M3 should change". Plan it with Ben as a dated doc with a `tasks:` block.
