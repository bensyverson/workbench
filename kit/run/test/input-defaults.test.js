// An Event input field's default, end to end (Ben's ruling 4, 2026-11-26): compose plans the fill on the wire as
// data (the composed record and the plan say it), the run fills the field into every record whose producer lacks
// it, and a field with no default is still refused (S202). A producer that has the field gives its own value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay } from "../index.js";
import { compose } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { tiny } from "./helpers.js";

/**
 * A producer of `seam` records, and a consumer of `takes` that keeps every record it is handed, wired with `opts`.
 * @param {string} seam @param {string} takes @param {(n: number) => Record<string, unknown>} make @param {any} [opts]
 */
function kits(seam, takes, make, opts) {
  const prod = tiny("prod", { state: { n: "f64" }, inputs: false, ports: { out: { e: { seam } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), step: (/** @type {any} */ s, /** @type {any} */ c) => { c.events.e.push(make(s.n)); return { n: s.n + 1 }; }, events: { out: { e: 1 } } });
  const cons = tiny("cons", { state: { got: list("str", 1000) }, inputs: false, ports: { in: { e: { seam: takes } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ got: [] }), step: (/** @type {any} */ s, /** @type {any} */ c) => ({ got: [...s.got, ...c.inputs.e.map((/** @type {any} */ r) => JSON.stringify(r))] }), events: { in: { e: 8 } } });
  const a = /** @type {any} */ (prod.grammar("a")), b = /** @type {any} */ (cons.grammar("b"));
  const glue = compose("p").part(a).part(b).wire(a.out.e, b.in.e, opts);
  return { glue, runtimes: [prod.runtime, cons.runtime] };
}

const LACKS = /** @type {const} */ (["Event<{ n: f64 }>", "Event<{ n: f64, speed: f64 = 40, tag: str = 'pop' }>"]);

test("a producer whose record lacks a defaulted field: the wire plans the fill as data", () => {
  const { glue, runtimes } = kits(...LACKS, (n) => ({ n }));
  assert.deepEqual(glue.check({ runtimes }), []);
  const composed = glue.build({ runtimes });
  assert.deepEqual(composed.wires[0].fill, { speed: 40, tag: "pop" });
  assert.match(glue.plan()[0], /fills speed = 40, tag = 'pop'/);
});

// The scheduler copies each composed wire's fields into its own wire by name (kit/run/scheduler.js, createRun), and
// `fill` is not yet among them; that file is another leaf's while its split lands. carry() fills (carry.test.js).
test("a producer whose record lacks a defaulted field: the consumer sees the default", () => {
  const { glue, runtimes } = kits(...LACKS, (n) => ({ n }));
  const composed = glue.build({ runtimes });
  const run = createRun(composed, { runtimes });
  run.runUntil(0.5);
  assert.deepEqual(run.diagnostics, []);
  assert.deepEqual(run.state("b").got.map((/** @type {string} */ g) => JSON.parse(g)), [0, 1, 2].map((n) => ({ n, speed: 40, tag: "pop" })));
  assert.equal(replay(composed, { runtimes }, run.record()).ok, true, "replay fills the same");
});

test("a producer that has the field gives its own value, and the wire fills nothing", () => {
  const { glue, runtimes } = kits("Event<{ n: f64, speed: f64 }>", "Event<{ n: f64, speed: f64 = 40 }>", (n) => ({ n, speed: n * 10 }));
  const composed = glue.build({ runtimes });
  assert.equal("fill" in composed.wires[0], false);
  const run = createRun(composed, { runtimes });
  run.runUntil(0.25);
  assert.deepEqual(run.state("b").got.map((/** @type {string} */ g) => JSON.parse(g)), [{ n: 0, speed: 0 }, { n: 1, speed: 10 }]);
});

test("a missing field with no default is still refused: S202, naming that it gives no default", () => {
  const { glue, runtimes } = kits("Event<{ n: f64 }>", "Event<{ n: f64, speed: f64 }>", (n) => ({ n }));
  const ds = glue.check({ runtimes });
  assert.deepEqual(ds.map((/** @type {any} */ d) => d.code), ["S202"]);
  assert.match(ds[0].message, /no field 'speed'.*no default/);
});

test("a wire constant (set) reaches every record the consumer takes, and a replay sets the same", () => {
  const { glue, runtimes } = kits("Event<{ n: f64 }>", "Event<{ n: f64, tag: str, speed: f64 = 40 }>", (n) => ({ n }), { set: { tag: "pop" } });
  const composed = glue.build({ runtimes });
  assert.deepEqual([composed.wires[0].set, composed.wires[0].fill], [{ tag: "pop" }, { speed: 40 }]);
  const run = createRun(composed, { runtimes });
  run.runUntil(0.25);
  assert.deepEqual(run.state("b").got.map((/** @type {string} */ g) => JSON.parse(g)), [0, 1].map((n) => ({ n, speed: 40, tag: "pop" })));
  assert.equal(replay(composed, { runtimes }, JSON.parse(JSON.stringify(run.record()))).ok, true);
});
