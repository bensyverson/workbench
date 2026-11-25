# DMG lowering pipeline

M1's pipeline over one DMG preset: build it with the [oracle](../dmg-oracle/README.md), read its declarations, describe them to the kit's DMG dialect as an environment, lower every runtime lambda to IR as one program, and emit each kernel as JS.

```js
import { loadDmg } from "../dmg-oracle/load.js";
import { swapLambda } from "../dmg-oracle/lambdas.js";
import { lowerPreset, emitEntry } from "./pipeline.js";

const dmg = loadDmg();
const { entries, sigs } = lowerPreset(dmg, "04");
// entries: { slot (the oracle's, which can swap the lambda), ref (the environment's view), result (kernel or diagnostics) }
const { emitted, fn } = emitEntry(entries[0]);   // throws if the entry did not lower
const build = dmg.build("04");
swapLambda(build.spec, entries[0].slot.id, fn);
```

- A fragment lambda that several parts run is lowered once per part; swap it once.
- **Top-level helpers.** `lowerPreset` reads the program's source (`build.code`, or the preset's from `dmg.presets`), finds the top-level `const`s that runtime lambdas use (directly or through one another), and lowers them with the program: an arrow is a helper function, any other `const` a baked constant (`helperSources`). It returns `helpers`, and `emitEntry` instantiates a lambda with the lowered helpers in scope. A build made without its source (`DSL.run(code)` directly, as `scripts/dmg-diff/differential.js` does) has no helpers, so a lambda that calls one is skipped there until that builder keeps `code` on the build.
- `prerelease/widened.prerelease.js` swaps the lambdas that only lower with helpers (preset 14's `memory`) into a 1200-frame run on seeds 7 and 11.
- All 25 lambdas in presets 04–07 lower (`test/lower-corpus.test.js`).
- Every kernel lowered from every preset (the survey's 111 lambdas, plus the helpers that lower) and every IR golden passes the [IR verifier](../../kit/ir/README.md#verifying-a-kernel) as a finished program's kernels, with no `unknown` left (`test/verify-corpus.test.js`, about 0.3 s).
- `test/emit-oracle.test.js` swaps each emitted lambda of 04–07 into a fresh build, alone, and expects a 600-frame run (seed 7, generated input, rendering every 4th tick) to match the original's trace. It is a quick check, not the differential report: a mutation probe found that a single short run misses boundary changes (`>` to `>=` where the boundary value never occurs) and the `done` lambdas of games that end after frame 600.
- The IR goldens for preset 04's `Mole.onFrame#0` and `timer(spawn)` are in `test/golden/`, as JSON and as a listing. After a deliberate IR change, rewrite them with `UPDATE_GOLDEN=1 node --test scripts/dmg-lower/test/lower-corpus.test.js` and review the diff.

**Effects census.** `node scripts/dmg-lower/effects-census.js` lowers every preset and sorts each lambda into the first class that fits: it writes the world (`World.*`, the board `bg`) or spawns, emits or destroys; it writes entity fields only; it has other effects only; it only reads and calls. It also counts, per effect verb and per world place written, the lambdas that carry it. The 15 of 126 entries that do not lower have no Kernel and so no effects; it skips them and prints how many (`skipped (did not lower): 15 of 126 entries`), so the classes cover the 111 that lower. On 2026-11-24 it gave 39 / 22 / 23 / 27 of 111. The world writes sit almost all in code that runs once (11 event handlers, 3 methods called from them, 2 inits, a timer and six once-a-frame lambdas); the one per-instance world write is `Rock.onFrame`'s `w.dodged++`, a counter. The IR names a written entity's kind, not its instance, so "entity fields" covers self and an entity an event handed in.

> Corrected 2026-11-25: until then the per-verb line was labeled "lambdas carrying each" but counted effects (read: 247, more than the 111 lambdas); it now counts lambdas (read: 105). The four classes and the world places were already per lambda and are unchanged.
