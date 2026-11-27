// Times lowering of the fields domain-warp Program (uses the Library's pmod/vnoise/fbm).
import { lowerField } from "../../kit/dialects/fields/index.js";
import { domainWarpCalls } from "../../kit/dialects/fields/programs/domain-warp-calls.js";

const prog = domainWarpCalls.build ? domainWarpCalls.build() : domainWarpCalls;
lowerField(prog); // warm
const n = 20;
const t0 = performance.now();
for (let i = 0; i < n; i++) lowerField(prog);
const ms = (performance.now() - t0) / n;
console.log(`lowerField(domain-warp-calls): ${ms.toFixed(2)} ms per lowering (mean of ${n}, after one warm-up)`);
