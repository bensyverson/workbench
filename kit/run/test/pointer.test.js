// @ts-nocheck: handles and builder chains are generated, which TypeScript cannot see.
// The pointer input (project/2026-11-27-controls-draft.md, requirements 3 and 5; build plan group 30): kit/run takes
// `{ kind: "pointer", T, part, value }` for the part whose UI names a pointer input on its stage, delivers it there,
// coalesces a run of moves to its last, and carries the rest over past the input's max. A lens bench.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay, RunError } from "../index.js";
import { compose } from "../../compose/index.js";
import { defineUI, list, pointerSeam } from "../../define/index.js";
import { tiny } from "./helpers.js";

function bench(max = 3) {
  const t = tiny("lens", {
    state: { got: list("str", 1000) }, inputs: false,
    frames: { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [100, 100] }) } },
    ports: { in: { pointer: { seam: pointerSeam("px") } }, out: { view: { seam: "Draw<4>@px", from: () => [{ op: "rect", at: [0, 0], size: [1, 1], fill: "#ffffff" }] } } },
  }, { clock: () => ({ tick: 1 / 4 }), events: { in: { pointer: max } }, init: () => ({ got: [] }), step: (s, c) => ({ got: [...s.got, ...c.inputs.pointer.map((r) => `${r.phase}${r.at[0]}`)] }) });
  const other = tiny("other", { state: { n: "f64" }, inputs: false, ports: {} }, { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), step: (s) => s });
  const ui = defineUI(t.grammar, { stage: { draw: "view", pointer: "pointer" } });
  const packages = [{ name: "lens", ui }];
  const b = t.grammar("bench");
  const built = compose("bench").part(b).part(other.grammar("aside")).show(b).build({ runtimes: [t.runtime, other.runtime], packages });
  return { composed: built, runtimes: [t.runtime, other.runtime], packages };
}
const P = (phase, x) => ({ phase, at: [x, 0], pointer: 1, buttons: phase === "move" ? 0 : 1, clicks: 1, wheel: [0, 0], hit: "", shift: false, alt: false, meta: false });
const ptr = (T, phase, x, part = "bench") => ({ kind: "pointer", T, part, value: P(phase, x) });

test("30. pointer inputs: delivered to the named input, refused (N013, N012), moves coalesced, the rest carried over, a replay matches", () => {
  const s = bench(8);
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [ptr(0.1, "move", 1), ptr(0.11, "move", 2), ptr(0.12, "move", 3), ptr(0.13, "down", 4), ptr(0.14, "move", 5), ptr(0.15, "move", 6), ptr(0.16, "up", 7), ptr(0.17, "wheel", 8), ptr(0.18, "leave", 9)] });
  run.runUntil(0.5);
  assert.deepEqual(run.state("bench").got, ["move3", "down4", "move6", "up7", "wheel8", "leave9"]);
  const code = (e) => { try { run.input(e); return null; } catch (x) { assert.ok(x instanceof RunError, String(x)); return x.diagnostics[0].code; } };
  assert.equal(code(ptr(0.6, "down", 1, "aside")), "N013", "a part with no pointer input");
  assert.equal(code({ kind: "pointer", T: 0.6, part: "bench", value: { phase: "tap", at: [0, 0] } }), "N012");
  const small = bench(2);
  const carry = createRun(small.composed, { runtimes: small.runtimes, inputs: [ptr(0.1, "down", 1), ptr(0.11, "up", 2), ptr(0.12, "down", 3), ptr(0.13, "up", 4), ptr(0.14, "wheel", 5)] });
  carry.runUntil(1);
  assert.deepEqual(carry.state("bench").got, ["down1", "up2", "down3", "up4", "wheel5"], "never dropped: carried over");
  assert.ok(Object.values(carry.stats().carried).reduce((a, b) => a + b, 0) > 0);
  assert.equal(replay(small.composed, { runtimes: small.runtimes, packages: small.packages }, JSON.parse(JSON.stringify(carry.record()))).ok, true);
});

test("30. moves coalesce per pointer: two fingers moving in turn each deliver their last move, in stamp order; one finger's run still coalesces", () => {
  const s = bench(8);
  const two = (T, x, pointer) => ({ kind: "pointer", T, part: "bench", value: { ...P("move", x), pointer } });
  const run = createRun(s.composed, { runtimes: s.runtimes, inputs: [two(0.1, 11, 1), two(0.11, 91, 2), two(0.12, 12, 1), two(0.13, 92, 2), two(0.14, 13, 1), two(0.15, 93, 2), two(0.16, 14, 1)] });
  run.runUntil(0.5);
  assert.deepEqual(run.state("bench").got, ["move93", "move14"], "each finger's last move, in the order they were stamped");
  assert.equal(replay(s.composed, { runtimes: s.runtimes, packages: s.packages }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});
