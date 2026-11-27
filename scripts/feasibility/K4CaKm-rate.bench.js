// Scratch: how fast kit/run steps a part at audio rates. Not a test; run with node.
// Per-sample: tick 1/48000, state { k }. Per-block: tick 128/48000, state holds a 128-sample block computed in step.
import { list } from "../../kit/define/index.js";
import { compose } from "../../kit/compose/index.js";
import { createRun } from "../../kit/run/index.js";
import { tiny } from "../../kit/run/test/helpers.js";

function part(n, clock, state, step) {
  const t = tiny(n, { state, inputs: false, ports: { out: {}, in: {} } }, { clock: () => clock, init: () => step(null), step: (s) => step(s) });
  return { part: t.grammar(n + "x"), runtime: t.runtime };
}

function bench(label, p, seconds, dev) {
  const composed = compose("b").part(p.part).build({ runtimes: [p.runtime] });
  const run = createRun(composed, { runtimes: [p.runtime], dev });
  const t0 = performance.now();
  run.runUntil(seconds);
  const ms = performance.now() - t0;
  const audio = seconds * 1000;
  console.log(`${label.padEnd(34)} dev=${String(dev).padEnd(5)} ${seconds}s audio in ${ms.toFixed(0)} ms  (${(ms / audio).toFixed(2)}x real time)`);
}

const perSample = () => part("ps", { tick: 1 / 48000 }, { k: "f64" }, (s) => ({ k: s ? s.k + 1 : 0 }));
const B = 128;
const perBlock = () => part("pb", { tick: B / 48000 }, { phase: "f64", block: list("f64", B) }, (s) => {
  const ph = s ? s.phase : 0, block = new Array(B);
  for (let i = 0; i < B; i++) block[i] = Math.sin(2 * Math.PI * 440 * (ph + i) / 48000);
  return { phase: ph + B, block };
});

for (const dev of [true, false]) {
  bench("per-sample tick 1/48000", perSample(), 0.1, dev);
  bench(`per-block tick ${B}/48000`, perBlock(), 1, dev);
}
