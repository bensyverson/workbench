// The `in` input (leaf ceE4ib; kit/package/README.md, "Tests"): one record on a part's Event input that nothing is
// wired to, in the input's own seam, delivered as a wire would deliver it, and in the log so a replay, a chunked run and
// a rewind give what the straight run gave. `taps` and `run.tapped` read the records an Event output pushed; `run.output`
// reads a value output as a wire would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun, replay, INPUT_KINDS } from "../index.js";
import { compose, page } from "../../compose/index.js";
import { list } from "../../define/index.js";
import { tiny, controlsOf, FOUR } from "./helpers.js";

/** A part that counts its `hit` records, sums their `points` (default 1), keeps each `$T`, and pushes `seen`. @param {{ max?: number, delivery?: any }} [o] */
function counter(o = {}) {
  const hit = { seam: "Event<{ points: f64 = 1, at: point2@px }>", note: "a hit", ...(o.delivery ? { delivery: o.delivery } : {}) };
  return tiny("count", {
    state: { n: "f64", sum: "f64", stamps: list("f64", 1000), at: list("f64", 1000) },
    ports: { in: { hit, slot: { seam: "f64", default: 0, note: "a value" } }, out: { seen: { seam: "Event<{ n: f64 }>", note: "seen" }, total: { seam: "f64", from: "sum", note: "the total" } } },
  }, {
    clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0, sum: 0, stamps: [], at: [] }), events: { in: { hit: o.max ?? 8 }, out: { seen: 4 } },
    step: (/** @type {any} */ s, /** @type {any} */ c) => {
      c.inputs.hit.forEach((/** @type {any} */ _r, /** @type {number} */ i) => c.events.seen.push({ n: s.n + 1 + i }));
      return { n: s.n + c.inputs.hit.length, sum: s.sum + c.inputs.hit.reduce((/** @type {number} */ a, /** @type {any} */ r) => a + r.points, 0), stamps: [...s.stamps, ...c.inputs.hit.map((/** @type {any} */ r) => r.$T)], at: [...s.at, ...c.inputs.hit.flatMap((/** @type {any} */ r) => r.at)] };
    },
  });
}
const AT = [1, 2];
const hit = (/** @type {number | string} */ T, value = /** @type {Record<string, any>} */ ({ at: AT })) => ({ kind: "in", T, part: "c", name: "hit", value });

/** @param {any} W @param {Record<string, any>} [o] */
function made(W, o = {}) {
  const c = /** @type {any} */ (W.grammar("c"));
  const composed = compose("one").part(c).build({ runtimes: [W.runtime] });
  return { composed, run: createRun(composed, { runtimes: [W.runtime], ...o }) };
}

test("`in` is an input kind", () => {
  assert.ok(INPUT_KINDS.includes("in"));
});

test("a record reaches the Event input at its stamp, a missing default filled, $T the stamp, and the log keeps it as given", () => {
  const W = counter();
  const { run } = made(W, { inputs: [hit(0.6), hit(0.6, { at: [3, 4], points: 5 })] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics, []);
  assert.equal(run.state("c").n, 2);
  assert.equal(run.state("c").sum, 6, "1 by default, then 5");
  assert.deepEqual(run.state("c").stamps, [0.6, 0.6]);
  assert.deepEqual(run.log.inputs[0].value, { at: AT }, "the log holds the record as given, not filled");
  assert.equal(run.log.inputs[0].kind, "in");
});

test("a record is taken by the part's first step at or after its stamp, not before", () => {
  const W = counter();
  const { run } = made(W, { inputs: [hit(0.6)] });
  run.runUntil(0.5);
  assert.equal(run.state("c").n, 0);
  run.runUntil(0.75);
  assert.equal(run.state("c").n, 1);
});

test("the log's copy and the delivered record are copies: the host changing its object changes nothing", () => {
  const W = counter();
  const value = { at: [1, 2] };
  const { run } = made(W);
  run.input({ kind: "in", T: 0.6, part: "c", name: "hit", value });
  value.at[0] = 99;
  run.runUntil(1);
  assert.deepEqual(run.state("c").at, [1, 2]);
});

test("refused when logged, the run unchanged: no such part (N009), no such input, a value input, an Event output (N011)", () => {
  const W = counter();
  const { run } = made(W);
  /** @param {any} e @param {string} code @param {RegExp} text */
  const refused = (e, code, text) => {
    const n = run.log.inputs.length;
    assert.throws(() => run.input(e), (/** @type {any} */ err) => err.name === "RunError" && err.diagnostics[0].code === code && text.test(err.message));
    assert.equal(run.log.inputs.length, n);
  };
  refused({ kind: "in", T: 1, part: "nope", name: "hit", value: { at: AT } }, "N009", /no part 'nope'/);
  refused({ kind: "in", T: 1, part: "c", name: "nothing", value: {} }, "N011", /no Event input 'nothing'.*hit/);
  refused({ kind: "in", T: 1, part: "c", name: "slot", value: 1 }, "N011", /value input.*Event input/);
  refused({ kind: "in", T: 1, part: "c", name: "seen", value: {} }, "N011", /Event input/);
  assert.throws(() => createRun(made(W).composed, { runtimes: [W.runtime], inputs: [{ kind: "in", T: 1, part: "c", name: "nothing", value: {} }] }), /N011/, "the same through createRun's inputs");
});

test("refused when logged: a record that does not fit the input's seam (N012)", () => {
  const W = counter();
  const { run } = made(W);
  for (const [value, text] of /** @type {Array<[any, RegExp]>} */ ([[{}, /at.*missing/], [{ at: [1, 2], extra: 1 }, /extra/], [{ at: [1] }, /at/], [{ at: [1, 2], points: "x" }, /points/], [null, /record/], [[1], /record/]])) {
    assert.throws(() => run.input({ kind: "in", T: 1, part: "c", name: "hit", value }), (/** @type {any} */ err) => err.diagnostics?.[0].code === "N012" && text.test(err.message), JSON.stringify(value));
  }
  assert.equal(run.log.inputs.length, 0);
  assert.doesNotThrow(() => run.input({ kind: "in", T: 1, part: "c", name: "hit", value: { at: [1, 2], points: 3 } }), "what fits is still logged");
});

test("an Event input a wire feeds takes no `in` (N011), and one a page wire feeds neither", () => {
  const W = tiny("pg", { state: { n: "f64" }, inputs: false, ports: { in: { pad: { seam: "Event<{ up: bool, down: bool, left: bool, right: bool }>", note: "pad" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), events: { in: { pad: 120 } }, step: (/** @type {any} */ s) => s });
  const h = /** @type {any} */ (W.grammar("h"));
  // the part's own declared pad (declared Controls, 2026-11-27), where PAGE_CONTROLS once gave one
  const composed = compose("w").part(h).wire(page.out.pad, h.in.pad).build({ runtimes: [W.runtime], packages: controlsOf(W, { pad: FOUR }) });
  const run = createRun(composed, { runtimes: [W.runtime] });
  assert.throws(() => run.input({ kind: "in", T: 1, part: "h", name: "pad", value: { up: false, down: false, left: false, right: true } }), (/** @type {any} */ e) => e.diagnostics[0].code === "N011" && /wire feeds/.test(e.message));
});

test("the input's keepLast delivery trims and counts, as on a wire (N001)", () => {
  const W = counter({ delivery: { keepLast: 2 } });
  const { run } = made(W, { inputs: [hit(0.6, { at: [1, 1], points: 1 }), hit(0.6, { at: [2, 2], points: 2 }), hit(0.6, { at: [3, 3], points: 4 })] });
  run.runUntil(1);
  assert.equal(run.state("c").sum, 6, "the newest two: 2 and 4");
  assert.deepEqual(run.stats().dropped, { "in → c.in.hit": 1 });
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.severity]), [["N001", "warning"]]);
});

test("a step that would take more than the runtime's max stops the part (N002), as on a reliable wire", () => {
  const W = counter({ max: 2 });
  const { run } = made(W, { inputs: [hit(0.6), hit(0.6), hit(0.6)] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.map((d) => [d.code, d.part]), [["N002", "c"], ["N001", "c"]], "the part stops, and the three waiting records are dropped and counted");
  assert.equal(run.state("c").n, 0, "none were taken");
});

test("a stopped part takes none: dropped and counted (N001)", () => {
  const W = tiny("stop", { state: { n: "f64" }, inputs: false, ports: { in: { hit: { seam: "Event<{ x: f64 = 0 }>", note: "n" } } } },
    { clock: () => ({ tick: 1 / 4 }), init: () => ({ n: 0 }), events: { in: { hit: 8 } }, step: (/** @type {any} */ s, /** @type {any} */ c) => { if (c.T >= 0.5) throw new Error("boom"); return { n: s.n + c.inputs.hit.length }; } });
  const c = /** @type {any} */ (W.grammar("c"));
  const composed = compose("s").part(c).build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime], inputs: [{ kind: "in", T: 0.75, part: "c", name: "hit", value: {} }] });
  run.runUntil(1);
  assert.deepEqual(run.diagnostics.map((d) => d.code), ["N004", "N001"]);
  assert.deepEqual(run.stats().stopped, { "in → c.in.hit": 1 });
});

test("a replay, a chunked run, a restart from a rewind and the straight run agree", () => {
  const W = counter();
  const inputs = [hit(0.3), hit(0.6, { at: [3, 4], points: 5 }), hit(1.6), hit(2.1, { at: [7, 7], points: 2 })];
  const { composed, run } = made(W, { inputs });
  run.runUntil(3);
  const straight = JSON.stringify(run.record());
  const chunked = made(W, { inputs }).run;
  for (let t = 0.1; t < 3; t += 0.35) chunked.runUntil(t);
  chunked.runUntil(3);
  assert.equal(JSON.stringify(chunked.record().hashes), JSON.stringify(run.record().hashes));
  assert.equal(replay(composed, { runtimes: [W.runtime] }, JSON.parse(straight)).ok, true);
  run.rewind(1.2);
  assert.equal(run.log.inputs.length, 2, "a rewind is a branch: the inputs after its target are dropped");
  for (const e of inputs.slice(2)) run.input(e);
  run.runUntil(3);
  assert.equal(JSON.stringify(run.record().hashes), JSON.stringify(chunked.record().hashes), "the same records sent again after the rewind give the straight run");
  assert.equal(run.state("c").sum, 9);
});

test("taps: every record an Event output pushed, in push order, each a frozen copy with its instant, wired or not", () => {
  const W = counter();
  const c = /** @type {any} */ (W.grammar("c"));
  const composed = compose("one").part(c).build({ runtimes: [W.runtime] });
  const run = createRun(composed, { runtimes: [W.runtime], taps: ["c.out.seen"], inputs: [hit(0.3), hit(0.3), hit(0.8)] });
  run.runUntil(1);
  assert.deepEqual(run.tapped("c.out.seen"), [{ T: 0.5, record: { n: 1 } }, { T: 0.5, record: { n: 2 } }, { T: 1, record: { n: 3 } }]);
  assert.ok(Object.isFrozen(run.tapped("c.out.seen")[0].record));
  run.rewind(0.6);
  assert.equal(run.tapped("c.out.seen").length, 2, "a rewind drops what came after its target");
  run.input(hit(0.8));
  run.runUntil(1);
  assert.equal(run.tapped("c.out.seen").length, 3, "the same record sent again after the rewind");
});

test("a tap changes no state hash, so a replay needs none", () => {
  const W = counter();
  const c = /** @type {any} */ (W.grammar("c"));
  const composed = compose("one").part(c).build({ runtimes: [W.runtime] });
  const inputs = [hit(0.3)];
  const a = createRun(composed, { runtimes: [W.runtime], taps: ["c.out.seen"], inputs }).runUntil(2);
  const b = createRun(composed, { runtimes: [W.runtime], inputs }).runUntil(2);
  assert.equal(JSON.stringify(a.record()), JSON.stringify(b.record()));
});

test("a tap handle that is not an Event output of a part throws, naming the outputs; so does tapped() of an untapped one", () => {
  const W = counter();
  const c = /** @type {any} */ (W.grammar("c"));
  const composed = compose("one").part(c).build({ runtimes: [W.runtime] });
  for (const bad of ["c.out.total", "c.out.nope", "z.out.seen", "c.in.hit", "seen"]) assert.throws(() => createRun(composed, { runtimes: [W.runtime], taps: [bad] }), /Event output.*c\.out\.seen/, bad);
  const run = createRun(composed, { runtimes: [W.runtime] });
  assert.throws(() => run.tapped("c.out.seen"), /not tapped/);
});

test("run.output: a value output as a wire would read it, before conversion; null before init; Event and unknown ports throw", () => {
  const W = counter();
  const { run } = made(W, { inputs: [hit(0.3, { at: [1, 1], points: 4 })] });
  assert.equal(run.output("c", "total"), 0);
  run.runUntil(1);
  assert.equal(run.output("c", "total"), 4);
  assert.throws(() => run.output("c", "seen"), /value outputs.*total/);
  assert.throws(() => run.output("c", "nope"), /value outputs.*total/);
  assert.throws(() => run.output("z", "total"), /no part 'z'/);
});
