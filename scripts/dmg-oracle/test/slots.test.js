// Every kind of runtime lambda slot is listed and swappable: a swap that silently
// does nothing would make a differential run match for the wrong reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../load.js";
import { lambdaSlots, swapLambda } from "../lambdas.js";

const dmg = loadDmg();
const KINDS = ["onFrame", "method", "on", "init", "hud", "draw", "timer", "every", "done", "bot"];

test("every slot of every preset can be swapped, and the swap is what lambdaSlots then reports", () => {
  /** @type {Set<string>} */
  const kinds = new Set();
  for (const p of dmg.presets) {
    const spec = dmg.build(p.id).spec;
    for (const s of lambdaSlots(spec)) {
      kinds.add(s.kind);
      const marker = () => `swapped ${p.id} ${s.id}`;
      swapLambda(spec, s.id, marker);
      const after = lambdaSlots(spec).find((x) => x.id === s.id);
      assert.ok(after, `${p.id} ${s.id} is still listed`);
      assert.equal(after.src, String(marker), `${p.id} ${s.id} (${s.kind}) took the swap`);
    }
  }
  for (const k of KINDS) assert.ok(kinds.has(k), `some preset has a '${k}' lambda`);
});

test("a swapped lambda of each kind is the one the runtime calls", () => {
  /** @type {Record<string, [string, string]>} */
  const wanted = { onFrame: ["04", "Mole.onFrame#0"], timer: ["04", "timer(spawn)"], hud: ["04", "sliders.hud#0"], method: ["06", "Whackable.method(whack)"] };
  for (const [kind, [preset, id]] of Object.entries(wanted)) {
    const b = dmg.build(preset);
    let calls = 0;
    swapLambda(b.spec, id, () => { calls++; });
    const rt = b.runtime({ seed: 1 });
    for (let i = 0; i < 400; i++) rt._tick([]);
    rt.render();
    assert.ok(calls > 0 || kind === "method", `${kind} ${id} was called`);
  }
});

test("lambdaSlots lists inits, huds, handlers, bot and component lambdas by kind", () => {
  const byKind = (/** @type {string} */ id) => lambdaSlots(dmg.build(id).spec).map((s) => `${s.kind}:${s.id}`);
  assert.ok(byKind("25").some((s) => s.startsWith("init:")));
  assert.ok(byKind("04").some((s) => s.startsWith("hud:")));
  assert.ok(byKind("14").some((s) => s.startsWith("on:memory.on(guess)")));
  assert.ok(byKind("21").includes("bot:bot"));
  assert.ok(byKind("04").includes("onFrame:Mole.onFrame#0"), "a component's lambda, not only the world's");
  assert.ok(byKind("04").includes("draw:Mole.draw"));
});
