// Each test changes one thing in a run and asserts that the trace notices, at the
// field that should notice it. A "match" in the M1 differential run is only worth
// what these tests pin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDmg } from "../load.js";
import { inputTrace } from "../inputs.js";
import { lambdaSlots, swapLambda } from "../lambdas.js";
import { runTrace, firstDifference } from "../trace.js";

/** @type {ReturnType<typeof loadDmg> | undefined} */
let cached;
const dmgOnce = () => (cached ??= loadDmg());
/** @param {string} idOrCode */
const build = (idOrCode) => dmgOnce().build(idOrCode);

/**
 * A one-entity game: `ent` runs on the entity every frame, `world` on the world.
 * @param {string} ent
 * @param {string} [world]
 */
const game = (ent, world = "") => `
  const T = component("T").attr("n", { type: "u8" }).onFrame((self, w) => { ${ent} });
  Game("g").attr("a", { type: "u8" }).place(T, { x: 8, y: 8 }).onFrame((w) => { ${world} }).build();`;

/**
 * Asserts that two programs trace differently and that the first difference is at `path`.
 * @param {string} a
 * @param {string} b
 * @param {RegExp} path
 * @param {Partial<import("../trace.js").TraceOptions>} [extra]
 */
function differsAt(a, b, path, extra = {}) {
  const opts = { seed: 1, frames: 6, ...extra };
  const d = firstDifference(runTrace(build(a), opts), runTrace(build(b), opts));
  assert.ok(d, `traces match, expected a difference at ${path}`);
  assert.match(d.path, path);
}

test("entity state: v, x, y, visible and alive each change the trace", () => {
  differsAt(game("self.n = 1;"), game("self.n = 2;"), /^ents\.0\.v\.n$/);
  differsAt(game("self.x = 20;"), game("self.x = 30;"), /^ents\.0\.x$/);
  differsAt(game("self.y = 20;"), game("self.y = 30;"), /^ents\.0\.y$/);
  differsAt(game("self.visible = false;"), game(""), /^ents\.0\.visible$/);
  differsAt(game("self.alive = false;"), game(""), /^ents\.0\.alive$/);
});

test("world attributes change the trace", () => {
  differsAt(game("", "w.a = 1;"), game("", "w.a = 2;"), /^world\.a$/);
});

test("background: cell contents, glyph identity, scroll and oamStart each change the trace", () => {
  differsAt(game("", 'w.bg.text(1, 1, "A");'), game("", 'w.bg.text(2, 1, "A");'), /^bg\.hash$/);
  differsAt(game("", 'w.bg.text(25, 25, "A");'), game("", 'w.bg.text(25, 25, "B");'), /^bg\./);
  differsAt(game("", "w.bg.scroll(3, 0);"), game("", "w.bg.scroll(4, 0);"), /^bg\.scx$/);
  differsAt(game("", "w.bg.scroll(0, 3);"), game("", "w.bg.scroll(0, 4);"), /^bg\.scy$/);
  differsAt(game("", "w.oamStart = 1;"), game("", "w.oamStart = 2;"), /^oamStart$/);
});

test("game over and its reason change the trace", () => {
  differsAt(game("", 'w.end("x");'), game(""), /^over$/);
  differsAt(game("", 'w.end("x");'), game("", 'w.end("y");'), /^reason$/);
});

test("a log entry's data changes the trace", () => {
  const prog = (/** @type {number} */ n) => game("", `w.emit("e", { k: ${n} });`);
  differsAt(prog(1), prog(2), /^log\.\d+\.data\.k$/);
});

test("the framebuffer hash changes the trace on a render tick, and by default", () => {
  const a = runTrace(build("04"), { seed: 3, frames: 300, renderEvery: 4 });
  const b = build("04");
  swapLambda(b.spec, "Mole.draw", () => null);
  const d = firstDifference(a, runTrace(b, { seed: 3, frames: 300, renderEvery: 4 }));
  assert.ok(d);
  assert.equal(d.path, "fb");
  assert.equal(d.tick % 4, 3, "on a render tick");
});

test("P2 a swapped draw lambda changes the trace with default options", () => {
  const opts = { seed: 3, frames: 300 };
  const a = runTrace(build("04"), opts);
  const b = build("04");
  swapLambda(b.spec, "Mole.draw", () => null);
  assert.ok(firstDifference(a, runTrace(b, opts)), "draw swapped to always-null, yet traces match");
});

test("renderEvery 0 still means never render", () => {
  const t = runTrace(build("04"), { seed: 1, frames: 20, renderEvery: 0 });
  assert.ok(t.ticks.every((x) => x.fb === undefined));
});

test("P3 runTrace accepts params, and they take effect from tick 0", () => {
  const base = runTrace(build("04"), { seed: 1, frames: 40 });
  const t = runTrace(build("04"), { seed: 1, frames: 40, params: { spawn: 300 } });
  assert.ok(firstDifference(base, t), "a faster spawn timer changes the run");
  assert.ok(t.ticks[0].log.some((e) => e.t === "param" && e.name === "spawn"), "the param is logged on tick 0");
  const firstSpawn = (/** @type {import("../trace.js").Trace} */ tr) => tr.ticks.findIndex((x) => x.log.some((e) => e.t === "timer" && e.name === "spawn"));
  assert.equal(firstSpawn(t), 17, "300 ms is 18 frames: the timer was armed with the param, not the default (36 frames)");
  assert.equal(firstSpawn(base), 35);
});

test("params that are unknown or build-time only are refused", () => {
  assert.throws(() => runTrace(build("04"), { seed: 1, frames: 1, params: { nope: 1 } }), /No param 'nope'/);
  assert.throws(() => runTrace(build("04"), { seed: 1, frames: 1, params: { linger: 3 } }), /build-time only/);
});

test("P4 observing a run does not change it: an event payload holding an entity", () => {
  const code = `
    const Thing = component("Thing").attr("n", { type: "u8" }).onFrame((self, w) => { w.emit("ping", { who: self }); });
    Game("p4").place(Thing, { x: 8, y: 8 }).on("ping", (w, d) => { d.who.n = d.who.n + 1; }).build();`;
  const plain = build(code).runtime({ seed: 1 });
  for (let i = 0; i < 5; i++) plain._tick([]);
  assert.equal(plain.err, null);
  const t = runTrace(build(code), { seed: 1, frames: 5 });
  assert.equal(t.ticks.at(-1)?.error, undefined);
  assert.equal(t.ticks.length, 5);
  const ping = t.ticks[0].log.find((e) => e.name === "ping");
  assert.deepEqual(ping?.data, { who: { $: "entity", kind: "Thing", index: 0 } });
});

test("P6 an RNG draw with no visible effect changes the trace, at the rng count", () => {
  differsAt(game("", ""), game("", "w.rand(4);"), /^rng$/);
});

test("the RNG count survives a restart, which replaces the generator", () => {
  const prog = `Game("r").attr("t", { type: "u8" }).onFrame((w) => { w.rand(2); if (w.frame === 1) w.end("x"); }).build();`;
  const t = runTrace(build(prog), { seed: 1, frames: 6, input: [[], [], ["start"], [], [], []] });
  assert.deepEqual(t.ticks.map((x) => x.rng), [1, 1, 0, 1, 1, 0]);
});

test("a restart reseeds the RNG: the generator the runtime swaps in is the one that draws", () => {
  const prog = `Game("r").attr("t", { type: "u8" }).onFrame((w) => { w.t = w.rand(250); if (w.frame === 1) w.end("x"); }).build();`;
  const t = runTrace(build(prog), { seed: 1, frames: 5, input: [[], [], ["start"], [], []] });
  assert.equal(t.ticks[3].world.t, t.ticks[0].world.t, "same seed, same first draw after a restart");
  assert.notEqual(t.ticks[0].world.t, t.ticks[1].world.t);
});

test("P5 background text with a different glyph changes the trace", () => {
  const prog = (/** @type {string} */ ch) => `Game("p5").onFrame((w) => { if (w.frame === 2) w.bg.text(25, 25, "${ch}"); }).build();`;
  const opts = { seed: 1, frames: 5, renderEvery: 1 };
  assert.ok(firstDifference(runTrace(build(prog("A")), opts), runTrace(build(prog("B")), opts)));
});

test("P8 values JSON cannot hold stay distinct: NaN vs null, undefined vs absent, -0 vs 0", () => {
  const prog = (/** @type {string} */ payload) => game("", `w.emit("e", ${payload});`);
  const pairs = [["{ a: NaN }", "{ a: null }"], ["{ a: undefined }", "{ }"], ["{ a: undefined }", "{ a: null }"], ["{ a: -0 }", "{ a: 0 }"], ["{ a: Infinity }", "{ a: null }"], ["{ a: NaN }", "{ a: Infinity }"]];
  for (const [x, y] of pairs) {
    differsAt(prog(x), prog(y), /^log\.\d+\.data/);
    const opts = { seed: 1, frames: 2 };
    assert.notEqual(JSON.stringify(runTrace(build(prog(x)), opts)), JSON.stringify(runTrace(build(prog(y)), opts)), `${x} vs ${y}: the JSON text differs too`);
  }
});

test("a user object with its own `$` key cannot pass for an encoded special value", () => {
  const prog = (/** @type {string} */ payload) => game("", `w.emit("e", ${payload});`);
  differsAt(prog('{ a: { $: "NaN" } }'), prog("{ a: NaN }"), /^log\.\d+\.data\.a/);
  differsAt(prog('{ a: { $: "undefined" } }'), prog("{ a: undefined }"), /^log\.\d+\.data\.a/);
});

test("entities and the world in a payload are named, not read", () => {
  const code = `
    const T = component("T").attr("n", { type: "u8" });
    Game("e").place(T, { x: 8, y: 8 }).place(T, { x: 16, y: 8 }, { as: "u" })
      .onFrame((w) => { w.emit("e", { who: w.all("T")[1], world: w }); }).on("e", (w, d) => {}).build();`;
  const t = runTrace(build(code), { seed: 1, frames: 1 });
  assert.equal(t.ticks[0].error, undefined);
  const e = t.ticks[0].log.find((x) => x.name === "e");
  assert.deepEqual(e?.data, { who: { $: "entity", kind: "T", index: 1 }, world: { $: "world" } });
});

test("one encoding for every compared value: world and entity attributes too", () => {
  const t = runTrace(build(game("", "")), { seed: 1, frames: 1 });
  assert.deepEqual(t.ticks[0].world, { a: 0 });
  differsAt(game("self.x = -0;"), game("self.x = 0;"), /^ents\.0\.x$/);
});

test("a runtime error ends the trace on its tick and is recorded", () => {
  const prog = game("", 'if (w.frame === 3) w.nope;');
  const t = runTrace(build(prog), { seed: 1, frames: 10 });
  assert.equal(t.ticks.length, 4);
  assert.match(t.ticks[3].error ?? "", /no 'nope'/);
  assert.equal(t.ticks[2].error, undefined);
});

test("P-m6 firstDifference names `error` when one run fails and the other does not", () => {
  const ok = runTrace(build(game("", "")), { seed: 1, frames: 10 });
  const bad = runTrace(build(game("", 'if (w.frame === 3) w.nope;')), { seed: 1, frames: 10 });
  const d = firstDifference(ok, bad);
  assert.ok(d);
  assert.equal(d.tick, 3);
  assert.equal(d.path, "error");
  assert.match(String(d.b), /no 'nope'/);
});

test("firstDifference compares length: a shorter trace differs from a longer one", () => {
  const a = runTrace(build(game("", "")), { seed: 1, frames: 5 });
  const b = runTrace(build(game("", "")), { seed: 1, frames: 3 });
  assert.deepEqual(firstDifference(a, b)?.path, "(missing tick)");
  assert.deepEqual(firstDifference(b, a)?.tick, 3);
  assert.equal(firstDifference(a, a), null);
});

test("P1 a swapped bot lambda changes the trace (bot presets 13 20 21 22 23 24)", () => {
  for (const id of ["13", "20", "21", "22", "23", "24"]) {
    const opts = { seed: 3, frames: 300, input: inputTrace(1, 300), renderEvery: 4 };
    const a = runTrace(build(id), opts);
    const b = build(id);
    let calls = 0;
    swapLambda(b.spec, "bot", () => { calls++; return ["start", "A", "left"]; });
    assert.ok(firstDifference(a, runTrace(b, opts)), `preset ${id}: swapped bot, yet traces match`);
    assert.ok(calls > 0, `preset ${id}: the bot ran`);
  }
});

test("the bot drives input when no input is given, and its choices are recorded", () => {
  const prog = `
    Game("b").attr("n", { type: "u8" }).bot((w) => ["A"]).onFrame((w) => { if (w.input.held("A")) w.n = w.n + 1; }).build();`;
  const t = runTrace(build(prog), { seed: 1, frames: 5 });
  assert.equal(t.ticks[4].world.n, 5);
  assert.deepEqual(t.ticks[0].bot, ["A"]);
  const given = runTrace(build(prog), { seed: 1, frames: 5, input: [] });
  assert.equal(given.ticks[4].world.n, 0, "explicit input wins over the bot");
  assert.deepEqual(given.ticks[0].bot, ["A"], "but the bot still runs and is recorded");
  const forced = runTrace(build(prog), { seed: 1, frames: 5, input: [], bot: true });
  assert.equal(forced.ticks[4].world.n, 5);
});

test("a build without a bot records no bot field", () => {
  const t = runTrace(build("04"), { seed: 1, frames: 2 });
  assert.ok(!("bot" in t.ticks[0]));
});

test("a bot that throws ends the trace with its error", () => {
  const prog = `Game("b").bot((w) => { w.nope; return []; }).build();`;
  const t = runTrace(build(prog), { seed: 1, frames: 5 });
  assert.equal(t.ticks.length, 1);
  assert.match(t.ticks[0].error ?? "", /no 'nope'/);
});

test("traces of presets with bots are still deterministic", () => {
  for (const id of ["13", "21", "24"]) {
    const opts = { seed: 3, frames: 200, renderEvery: 4 };
    assert.equal(JSON.stringify(runTrace(build(id), opts)), JSON.stringify(runTrace(build(id), opts)), id);
  }
});

test("lambdaSlots finds a timer's after-lambda, and swapping it takes effect", () => {
  const code = `Game("p7").attr("n", { type: "u8" }).timer("t", { after: (w) => 100 }, (w) => { w.n = 1; }).build();`;
  const ids = lambdaSlots(build(code).spec).map((s) => s.id);
  assert.ok(ids.includes("timer(t).after"), ids.join(", "));
  const b = build(code);
  swapLambda(b.spec, "timer(t).after", () => 100000);
  const t = runTrace(b, { seed: 1, frames: 30 });
  assert.equal(t.ticks[29].world.n, 0, "the timer no longer fires within 30 frames");
  assert.equal(runTrace(build(code), { seed: 1, frames: 30 }).ticks[29].world.n, 1);
});
