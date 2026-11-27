// Probe: what does kit/run's per-commit stateHash cost on an accumulation buffer?
import { stateHash } from "../../kit/build/index.js";

for (const side of [128, 256, 512]) {
  const N = side * side * 3;
  const s = { samples: 1, accum: Array.from({ length: N }, (_, i) => (i % 997) / 997) };
  stateHash(s);
  const t = performance.now();
  stateHash(s);
  console.log(`${side}x${side}x3 = ${N} numbers: stateHash ${(performance.now() - t).toFixed(1)} ms`);
}
