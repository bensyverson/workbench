import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../load.js";
import { inputTrace } from "../inputs.js";
import { lambdaSlots, swapLambda } from "../lambdas.js";
import { runTrace, firstDifference } from "../trace.js";

/** @type {ReturnType<typeof loadDmg> | undefined} */
let cached;
const dmgOnce = () => (cached ??= loadDmg());
/** @param {string} id */
const build = (id) => dmgOnce().build(id);
const M1 = ["04", "05", "06", "07"];

test("loadDmg exposes the DSL and all 22 presets by id", () => {
  const dmg = dmgOnce();
  assert.equal(typeof dmg.DSL.run, "function");
  assert.equal(dmg.presets.length, 22);
  for (const id of ["01", "04", "07", "14", "26", "31"]) assert.ok(dmg.preset(id), `preset ${id}`);
  assert.throws(() => dmg.preset("09"), /no preset '09'.*01/);
});

test("loadDmg builds independent specs, so swapping in one build leaves another alone", () => {
  const a = build("04"), b = build("04");
  assert.notEqual(a.spec.timers[0], b.spec.timers[0]);
});

test("inputTrace is deterministic per seed and uses only DMG buttons", () => {
  const a = inputTrace(7, 300), b = inputTrace(7, 300), c = inputTrace(8, 300);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.length, 300);
  const valid = new Set(["up", "down", "left", "right", "A", "B", "start", "select"]);
  for (const frame of a) for (const btn of frame) assert.ok(valid.has(btn), btn);
  assert.ok(a.some((f) => f.includes("A")), "presses A at some point");
});

test("lambdaSlots lists preset 04's runtime lambdas with stable ids", () => {
  const ids = lambdaSlots(build("04").spec).map((s) => s.id);
  for (const id of ["Mole.onFrame#0", "Mole.draw", "timer(spawn)", "sliders.hud#0"]) assert.ok(ids.includes(id), `${id} in ${ids}`);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
});

test("lambdaSlots carries kind, owner and the exact source text", () => {
  const slot = lambdaSlots(build("04").spec).find((s) => s.id === "Mole.onFrame#0");
  assert.ok(slot);
  assert.equal(slot.kind, "onFrame");
  assert.equal(slot.owner, "Mole");
  assert.match(slot.src, /--self\.ttl === 0/);
});

test("lambdaSlots lists a fragment's lambda once, under the fragment, with every part that uses it", () => {
  const slots = lambdaSlots(build("06").spec);
  const whack = slots.filter((s) => s.id === "Whackable.onFrame#0");
  assert.equal(whack.length, 1);
  assert.deepEqual(whack[0].usedBy, ["Mole"]);
  assert.ok(slots.some((s) => s.id === "Countdown.onFrame#0" && s.usedBy.includes("fragments")));
});

test("lambdaSlots includes timer every-lambdas, methods, handlers and done", () => {
  const ids12 = lambdaSlots(build("12").spec).map((s) => s.id);
  assert.ok(ids12.some((id) => /^timer\(.+\)\.every$/.test(id)), ids12.join(" "));
  const ids06 = lambdaSlots(build("06").spec).map((s) => s.id);
  for (const id of ["Whackable.method(whack)", "fragments.on(whack)#0", "done", "Hammer.draw"]) assert.ok(ids06.includes(id), `${id} in ${ids06}`);
});

test("swapLambda replaces the function the runtime calls", () => {
  const b = build("04");
  let calls = 0;
  swapLambda(b.spec, "Mole.onFrame#0", () => { calls++; });
  const rt = b.runtime({ seed: 1 });
  rt._tick([]);
  assert.equal(calls, 9, "one call per Mole");
  assert.throws(() => swapLambda(b.spec, "Mole.nope", () => {}), /no lambda 'Mole\.nope'.*Mole\.onFrame#0/);
});

for (const id of M1) {
  test(`preset ${id}: two runs with the same seed and input trace give byte-identical traces`, () => {
    const opts = { seed: 3, frames: 600, input: inputTrace(11, 600), renderEvery: 4 };
    const a = JSON.stringify(runTrace(build(id), opts));
    const b = JSON.stringify(runTrace(build(id), opts));
    assert.equal(a, b);
  });
}

test("a trace tick records frame, world, entities, background, log and framebuffer", () => {
  const t = runTrace(build("07"), { seed: 1, frames: 120, input: inputTrace(2, 120), renderEvery: 4 });
  assert.equal(t.ticks.length, 120);
  const tick = t.ticks[119];
  for (const k of ["frame", "over", "world", "ents", "bg", "oamStart", "log"]) assert.ok(k in tick, k);
  assert.ok(t.ticks[3].fb, "renders on the cadence");
  assert.equal(t.ticks[2].fb, undefined, "not between renders");
  assert.ok(t.ticks.some((x) => x.log.some((e) => e.t === "event" && e.name === "burst")), "captures events");
});

test("the trace keeps every log entry, beyond the runtime's 600-entry cap", () => {
  const t = runTrace(build("07"), { seed: 1, frames: 900, input: Array(900).fill(["A"]), renderEvery: 0 });
  const total = t.ticks.reduce((n, x) => n + x.log.length, 0);
  assert.ok(total > 600, `captured ${total}`);
});

test("firstDifference returns null for equal traces", () => {
  const opts = { seed: 3, frames: 200, input: inputTrace(1, 200), renderEvery: 4 };
  assert.equal(firstDifference(runTrace(build("04"), opts), runTrace(build("04"), opts)), null);
});

test("an altered lambda makes the comparison fail at the first differing tick and field", () => {
  const opts = { seed: 3, frames: 600, input: inputTrace(1, 600), renderEvery: 4 };
  const original = runTrace(build("04"), opts);
  const b = build("04");
  const slot = lambdaSlots(b.spec).find((s) => s.id === "timer(spawn)");
  assert.ok(slot);
  const altered = slot.src.replace("% 9", "% 8");
  assert.notEqual(altered, slot.src);
  swapLambda(b.spec, "timer(spawn)", new Function(`return (${altered})`)());
  const diff = firstDifference(original, runTrace(b, opts));
  assert.ok(diff, "a difference is found");
  assert.equal(typeof diff.tick, "number");
  assert.match(diff.path, /^world\.next$|^ents\.|^log|^fb/);
  assert.notDeepEqual(diff.a, diff.b);
});
