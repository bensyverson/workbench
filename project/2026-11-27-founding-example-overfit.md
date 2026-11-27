# Finding: the page's controls overfit the DMG pad

*2026-11-27. Raised by Ben while ruling on leaf `Lu11Q1`: "Are we overfitting button presses? Let's keep in mind our controls could be sliders, spreadsheets, drop downs.... I continually worry that we're baking too many assumptions based on DMG and other founding examples into our system, which is supposed to be generalizable", then "How did this happen? Was the project plan not clear enough?" and "I thought we came up with an entire UI library specifically to avoid this".*

## What is wrong

`kit/compose/page.js` hardcodes the page's controls as `PAGE_CONTROLS`, the DMG host's pad: `pad`, `a`, `b`, `start`, `select`. `kit/page/keys.js` maps keys only to those. This fixed set sits beside the UI library's own mechanisms, which are declared per package: `defineUI`'s `inputs` (buttons the host maps to its devices) and the generated `params` view (a control per param, written back to source). There are two mechanisms, and the fixed one wins. `examplePreset` then wires a control to an input by seam alone (commit `0639eb3`), which is ambiguous for any two controls of one kind: the four buttons share `Event<{ held: bool }>`, and so would two sliders.

## How it happened

1. **The ruling was general.** The M4 UI decision ([2026-11-25](2026-11-25-m4-ui-decision.md), §3, ruled by Ben): "Controls are declared input events… A Dialect declares its inputs, for example DMG's D-pad and A/B buttons. Each host maps them."
2. **The brief turned it into a fixed set.** The main thread wrote the `rc-wire` leaf ([the runtime contract plan](2026-11-26-runtime-contract-plan.md)): "Decide and document what the page part offers (at least the D-pad and buttons the DMG host has)." "What the page offers" turned declared controls into a built-in set, and "at least" was a floor the agent took as the whole. Commit `5e0813e` built `PAGE_CONTROLS`.
3. **Nothing checked the build against the ruling.** The review checked the code against the brief. Every trial since (score, game, maze, compose, layer, tests) was a game, so no blind agent ever needed a slider or a dropdown. The 2026-11-27 question on wiring by seam was framed around buttons and built on the fixed set.
4. **The UI library had already narrowed itself.** The UI draft scoped `inputs` to buttons ("an axis, a pointer or a pick as input are not built"), so even the declared path covers only what DMG needs.

The pattern: a founding example in a brief becomes the spec unless something checks the design against a workbench that is not that example. `examples/` holds `dmg`, `fields` and `data`, but only `dmg` has input beyond params, so no example could have caught it.

## What we do (Ben, 2026-11-27)

- **A design stage**, container `1ymuQu`: retire `PAGE_CONTROLS`, so the page's controls come from the packages' UI declarations; names bind and seams check; H009 becomes an error; decide which input kinds go beyond buttons. `Lu11Q1` folds into it. The draft waits on Ben's sketches of workbenches that differ in how people interact with them.
- **Process fixes**, recorded as a local ruling in `AGENTS.md` ("Serve more than the founding examples"): every kit contract names a non-founding workbench it must serve, briefs say which, reviews check against it, each design stage's dogfood includes a non-game leg, and a brief never states a founding example's set as a floor ("at least DMG's …") without saying the set is declared.
