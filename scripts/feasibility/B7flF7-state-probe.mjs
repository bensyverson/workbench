// Probe: can a run's state hold an accumulation buffer, and what does checkState cost on it?
import { defineDialect, list, exact } from "../../kit/define/index.js";

const d = defineDialect({
  name: "acc", numberType: "f64",
  spaces: { once: { pure: true } },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { f: { params: [], returns: "f64", space: "once" } },
  state: { samples: "f64", accum: list("f64") },
  text: () => "",
});

const N = 512 * 512 * 3;
const plain = { samples: 1, accum: new Array(N).fill(0.5) };
let t = performance.now();
const p1 = d.checkState(plain);
console.log("plain array", N, "items: problems", p1.length, "ms", (performance.now() - t).toFixed(1));

const typed = { samples: 1, accum: new Float32Array(N) };
t = performance.now();
const p2 = d.checkState(typed);
console.log("Float32Array: problems", p2.length, p2.slice(0, 2), "ms", (performance.now() - t).toFixed(1));

t = performance.now();
const copy = { ...plain, accum: plain.accum.map((v) => v + 0.1) };
console.log("one fresh copy of the buffer ms", (performance.now() - t).toFixed(1), copy.accum.length);
t = performance.now();
Object.freeze(copy.accum);
console.log("freeze ms", (performance.now() - t).toFixed(1));
