// Scratch: what a long per-sample run keeps (hashes per instant, the log) and costs, and a synth-shaped block state.
import { list, struct } from "../../kit/define/index.js";
import { compose } from "../../kit/compose/index.js";
import { createRun } from "../../kit/run/index.js";
import { tiny } from "../../kit/run/test/helpers.js";

function part(n, clock, state, step) {
  const t = tiny(n, { state, inputs: false, ports: { out: {}, in: {} } }, { clock: () => clock, init: () => step(null), step: (s) => step(s) });
  return { part: t.grammar(n + "x"), runtime: t.runtime };
}
function go(label, p, seconds, dev) {
  const composed = compose("b").part(p.part).build({ runtimes: [p.runtime] });
  const run = createRun(composed, { runtimes: [p.runtime], dev });
  const h0 = process.memoryUsage().heapUsed, t0 = performance.now();
  run.runUntil(seconds);
  const ms = performance.now() - t0, mb = (process.memoryUsage().heapUsed - h0) / 1e6;
  console.log(`${label.padEnd(40)} dev=${String(dev).padEnd(5)} ${seconds}s: ${ms.toFixed(0)} ms (${(ms / (seconds * 1000)).toFixed(2)}x), heap +${mb.toFixed(0)} MB, hashes ${run.hashes.length}`);
}

go("per-sample tick 1/48000", part("ps", { tick: 1 / 48000 }, { k: "f64" }, (s) => ({ k: s ? s.k + 1 : 0 })), 5, false);

// 16 voices x 6 operators of state, and a 128-sample block, stepped per block: the shape an FM synth's state would have.
const B = 128, V = 16, OPS = 6;
const op = struct({ phase: "f64", env: "f64", stage: "f64" });
const voice = struct({ note: "f64", vel: "f64", on: "bool", ops: list(op, OPS) });
const synthState = { voices: list(voice, V), block: list("f64", B) };
const synth = part("fm", { tick: B / 48000 }, synthState, (s) => {
  const voices = s ? s.voices : Array.from({ length: V }, (_, i) => ({ note: 60 + i, vel: 1, on: true, ops: Array.from({ length: OPS }, () => ({ phase: 0, env: 1, stage: 0 })) }));
  const block = new Array(B).fill(0);
  const next = voices.map((v) => {
    const f = 440 * 2 ** ((v.note - 69) / 12);
    const ops = v.ops.map((o) => ({ ...o }));
    for (let i = 0; i < B; i++) {
      let mod = 0;
      for (let k = OPS - 1; k >= 0; k--) { const o = ops[k]; o.phase += f * (k + 1) / 48000; mod = Math.sin(2 * Math.PI * o.phase + mod) * o.env; }
      block[i] += mod * v.vel / V;
    }
    for (const o of ops) o.phase -= Math.floor(o.phase);
    return { ...v, ops };
  });
  return { voices: next, block };
});
go("FM 16 voices x 6 ops, block 128", synth, 5, false);
go("FM 16 voices x 6 ops, block 128", synth, 5, true);
