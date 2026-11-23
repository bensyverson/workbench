# DMG lowering pipeline

M1's pipeline over one DMG preset: build it with the [oracle](../dmg-oracle/README.md), read its declarations, describe them to the kit's DMG dialect, lower every runtime lambda to IR as one program, and emit each kernel as JS.

```js
import { loadDmg } from "../dmg-oracle/load.js";
import { swapLambda } from "../dmg-oracle/lambdas.js";
import { lowerPreset, emitEntry } from "./pipeline.js";

const dmg = loadDmg();
const { entries, sigs } = lowerPreset(dmg, "04");
// entries: { slot (the oracle's, which can swap the lambda), ref (the dialect's view), result (kernel or diagnostics) }
const { emitted, fn } = emitEntry(entries[0]);   // throws if the entry did not lower
const build = dmg.build("04");
swapLambda(build.spec, entries[0].slot.id, fn);
```

- A fragment lambda that several parts run is lowered once per part; swap it once.
- All 25 lambdas in presets 04–07 lower (`test/lower-corpus.test.js`).
- `test/emit-oracle.test.js` swaps each emitted lambda of 04–07 into a fresh build, alone, and expects a 600-frame run (seed 7, generated input, rendering every 4th tick) to match the original's trace. It is a quick check, not the differential report: a mutation probe found that a single short run misses boundary changes (`>` to `>=` where the boundary value never occurs) and the `done` lambdas of games that end after frame 600.
- The IR goldens for preset 04's `Mole.onFrame#0` and `timer(spawn)` are in `test/golden/`, as JSON and as a listing. After a deliberate IR change, rewrite them with `UPDATE_GOLDEN=1 node --test scripts/dmg-lower/test/lower-corpus.test.js` and review the diff.
