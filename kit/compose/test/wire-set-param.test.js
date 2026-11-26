// Two wire forms the seams draft's rulings added on 2026-11-26: a wire constant, `{ set: { <field>: <value> } }`
// (literal data, checked against the consumer field's seam, never an override of a field the producer sends), and a
// wire into a build-time param, `.wire(<part>.out.<port>, <part>.param.<name>)` (from a value output only, checked
// against the param's declaration; kit/run applies it between instants).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, formatDiagnostic } from "../index.js";
import { defineDialect, defineGrammar, defineRuntime, exact, vector, name, data, lambda, oneOf, list, struct } from "../../define/index.js";

/** Codes the cases below saw. @type {Set<string>} */
const seen = new Set();
/** @param {any} c @param {any} [o] */
const check = (c, o) => { const ds = c.check(o); for (const d of ds) seen.add(d.code); return ds; };
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);
const port = (/** @type {string} */ seam, /** @type {any} */ more = {}) => ({ seam, note: "n", ...more });

/**
 * A tiny Dialect and Grammar with these ports, a number param slot (`param`, with min and max) and a string one
 * (`mode`, with options), and a runtime at `clock`.
 * @param {string} n @param {Record<string, any>} ports @param {any} [clock]
 */
function tiny(n, ports, clock = { tick: 1 / 30 }) {
  // a value output reads a constant of its seam's kind, so its lambda's type pairs with the seam
  const constant = (/** @type {string} */ seam) => (seam === "bool" ? () => false : seam.startsWith("list") ? "items" : seam === "str" ? () => "calm" : () => 0);
  for (const p of Object.values(ports.out ?? {})) if (!p.seam.startsWith("Event")) p.from ??= constant(p.seam);
  const d = defineDialect(/** @type {any} */ ({
    name: n, numberType: "f64", text: () => "",
    types: { v2: vector(2, "f64") },
    spaces: { s: { pure: true } },
    objects: { In: { label: "the inputs (inp)", members: {} }, Params: { label: "the params ($)", members: {} } },
    globals: { inp: "In", $: "Params" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    params: { object: "Params", name: "$" },
    state: { t: "f64", items: list(struct({ n: "f64" }), 4) },
    frames: { px: { dims: 2, note: "pixels" } },
    ports, inputs: { object: "In", name: "inp" },
  }));
  const grammar = defineGrammar(d, {
    root: n, params: { slot: "param" },
    constructs: { [n]: { opens: [name()], slots: {
      param: { kind: "decl", args: [name("param"), data({ value: oneOf("number", "string"), "min?": "number", "max?": "number", "options?": "string[]" })], as: "params" },
      k: { kind: "decl", args: [lambda("k")] },
    } } },
  });
  /** @param {Record<string, any>} side */
  const events = (side = {}) => Object.fromEntries(Object.entries(side).filter(([, p]) => p.seam.startsWith("Event")).map(([k]) => [k, 8]));
  return { grammar, runtime: defineRuntime(grammar, { clock: () => clock, init: () => ({ t: 0 }), step: (/** @type {any} */ s) => s, events: { out: events(ports.out), in: events(ports.in) } }) };
}

/**
 * A producer `a` with output `o` and a consumer `b` with the params `depth` (a number) and `mode` (an enum), and input `i` when given.
 * @param {any} o @param {any} [i] @param {any} [clock]
 */
function parts(o, i, clock) {
  const A = tiny("prod", { out: { o } }, clock), B = tiny("cons", { in: i ? { i } : {}, out: { back: port("f64") } });
  const a = /** @type {any} */ (A.grammar("a")), b = /** @type {any} */ (B.grammar("b").param("depth", { value: 0, min: 0, max: 9 }).param("mode", { value: "calm", options: ["calm", "wild"] }));
  return { a, b, runtimes: [A.runtime, B.runtime] };
}

test("a param wire from a value output checks clean, is in the composed record, and the plan says when it applies", () => {
  const { a, b } = parts(port("f64"));
  const c = compose("t").part(a).part(b).wire(a.out.o, b.param.depth);
  assert.deepEqual(check(c), []);
  assert.deepEqual(c.build().wires, [{ from: "a.out.o", to: "b.param.depth", convert: [], rename: {}, delay: false, dropped: [] }]);
  assert.deepEqual(c.plan(), ["a.out.o → b.param.depth: unchanged; sets the param between instants"]);
});

test("a loop through a part that steps is no cycle: a param wire applies between instants (no S115, no S117)", () => {
  const A = tiny("prod", { out: { o: port("f64") }, in: { i: port("f64", { default: 0 }) } }), B = tiny("cons", { out: { back: port("f64") } });
  const a = /** @type {any} */ (A.grammar("a")), b = /** @type {any} */ (B.grammar("b").param("depth", { value: 0 }));
  const c = compose("t").part(a).part(b).wire(b.out.back, a.in.i).wire(a.out.o, b.param.depth);
  assert.deepEqual(check(c), []);
});

test("S111: a param the part does not declare, with a did-you-mean and the params it has", () => {
  const { a, b } = parts(port("f64"));
  const ds = check(compose("t").part(a).part(b).wire(a.out.o, b.param.dpeth));
  assert.deepEqual(codes(ds), ["S111"]);
  assert.match(ds[0].message, /part 'b' \(cons\) has no param 'dpeth'\. Did you mean 'depth'\? Its params: depth, mode/);
});

test("S112: a param wired twice; S102: a param wire with options, or a param as a wire's producer", () => {
  const { a, b } = parts(port("f64"));
  assert.deepEqual(codes(check(compose("t").part(a).part(b).wire(a.out.o, b.param.depth).wire(a.out.o, b.param.depth))), ["S112"]);
  const opt = check(compose("t").part(a).part(b).wire(a.out.o, b.param.depth, { delay: true }));
  assert.deepEqual(codes(opt), ["S102"]);
  assert.match(opt[0].message, /a param wire takes no options/);
  // the param where the output goes and the output where the input goes: each side is the wrong kind of handle
  assert.deepEqual(codes(check(compose("t").part(a).part(b).wire(b.param.depth, a.out.o))), ["S102", "S102"]);
});

test("a param wire's seam is checked against the param's declaration: an Event (S201), another kind (S201), a frame (S252), an enum it does not accept (S203)", () => {
  const ev = parts(port("Event<{ n: f64 }>"));
  const e = check(compose("t").part(ev.a).part(ev.b).wire(ev.a.out.o, ev.b.param.depth));
  assert.deepEqual(codes(e), ["S201"]);
  assert.match(e[0].message, /a param wire takes a value output, and a\.out\.o is an Event/);
  const bool = parts(port("bool"));
  assert.deepEqual(codes(check(compose("t").part(bool.a).part(bool.b).wire(bool.a.out.o, bool.b.param.depth))), ["S201"]);
  const tagged = parts(port("f64@px"));
  assert.deepEqual(codes(check(compose("t").part(tagged.a).part(tagged.b).wire(tagged.a.out.o, tagged.b.param.depth))), ["S252"]);
  const str = parts(port("str"));
  const d = check(compose("t").part(str.a).part(str.b).wire(str.a.out.o, str.b.param.mode));
  assert.deepEqual(codes(d), ["S203"]);
  assert.match(formatDiagnostic(d[0]), /to: +b\.param\.mode +'calm' \| 'wild'/);
});

test("S117: a param wire from the part's own output, or a loop of param wires alone (a rebuild would feed the next)", () => {
  const { a, b } = parts(port("f64"));
  const self = check(compose("t").part(a).part(b).wire(b.out.back, b.param.depth));
  assert.deepEqual(codes(self), ["S117"]);
  assert.match(self[0].message, /b\.out\.back feeds b\.param\.depth, a param of its own part/);
  const A = tiny("prod", { out: { o: port("f64") } }), B = tiny("cons", { out: { back: port("f64") } });
  const x = /** @type {any} */ (A.grammar("a").param("p", { value: 0 })), y = /** @type {any} */ (B.grammar("b").param("q", { value: 0 }));
  const loop = check(compose("t").part(x).part(y).wire(x.out.o, y.param.q).wire(y.out.back, x.param.p));
  assert.deepEqual(codes(loop), ["S117"]);
  assert.match(loop[0].message, /a → b → a/);
});

test("S118: a param wire fed from a tick-rate output is a warning (each change rebuilds); from a demand part, none", () => {
  const tick = parts(port("f64"), undefined, { tick: 1 / 30 });
  const c = compose("t").part(tick.a).part(tick.b).wire(tick.a.out.o, tick.b.param.depth);
  const ds = check(c, { runtimes: tick.runtimes });
  assert.deepEqual(ds.map((/** @type {any} */ d) => [d.code, d.severity]), [["S118", "warning"]]);
  assert.match(ds[0].message, /a ticks every 1\/30 s/);
  assert.ok(c.build({ runtimes: tick.runtimes }), "a warning does not stop a build");
  const demand = parts(port("f64"), undefined, { demand: true });
  assert.deepEqual(check(compose("t").part(demand.a).part(demand.b).wire(demand.a.out.o, demand.b.param.depth), { runtimes: demand.runtimes }), []);
});

test("a wire constant sets a consumer record field the producer lacks: literal data, in the record and the plan", () => {
  const { a, b } = parts(port("Event<{ n: f64 }>"), port("Event<{ n: f64, kind: 'coin' | 'key' }>"));
  const c = compose("t").part(a).part(b).wire(a.out.o, b.in.i, { set: { kind: "coin" } });
  assert.deepEqual(check(c), []);
  assert.deepEqual(c.build().wires[0].set, { kind: "coin" });
  assert.deepEqual(c.plan(), ["a.out.o → b.in.i: unchanged; sets kind = 'coin'"]);
  // with no set the field is S202, as before
  assert.deepEqual(codes(check(compose("t").part(a).part(b).wire(a.out.o, b.in.i))), ["S202"]);
});

test("S207: a set field the consumer does not take, a value that does not fit its seam, a set on a wire with no record or into a list", () => {
  const { a, b } = parts(port("Event<{ n: f64 }>"), port("Event<{ n: f64, kind: 'coin' | 'key' }>"));
  const miss = check(compose("t").part(a).part(b).wire(a.out.o, b.in.i, { set: { knid: "coin", kind: "coin" } }));
  assert.deepEqual(codes(miss), ["S207"]);
  assert.match(miss[0].message, /the input's record takes no field 'knid'\. Did you mean 'kind'\?/);
  const bad = check(compose("t").part(a).part(b).wire(a.out.o, b.in.i, { set: { kind: "gem" } }));
  assert.deepEqual(codes(bad), ["S207"]);
  assert.match(bad[0].message, /set: kind = 'gem' does not fit 'coin' \| 'key': it is not one of 'coin', 'key'/);
  const scalar = parts(port("f64"), port("f64", { default: 0 }));
  assert.deepEqual(codes(check(compose("t").part(scalar.a).part(scalar.b).wire(scalar.a.out.o, scalar.b.in.i, { set: { n: 1 } }))), ["S207"]);
  const lists = parts(port("list<{ n: f64 }, 4>"), port("list<{ n: f64, m: f64 }, 4>", { default: [] }));
  const l = check(compose("t").part(lists.a).part(lists.b).wire(lists.a.out.o, lists.b.in.i, { set: { m: 1 } }));
  assert.deepEqual(codes(l), ["S207"]);
  assert.match(l[0].message, /a list's items/);
});

test("S208: setting a field the producer also sends is an error, never an override; S102: a set that is not an object", () => {
  const { a, b } = parts(port("Event<{ n: f64, kind: 'coin' | 'key' }>"), port("Event<{ n: f64, kind: 'coin' | 'key' }>"));
  const ds = check(compose("t").part(a).part(b).wire(a.out.o, b.in.i, { set: { kind: "coin" } }));
  assert.deepEqual(codes(ds), ["S208"]);
  assert.match(ds[0].message, /the output's record sends kind/);
  assert.deepEqual(codes(check(compose("t").part(a).part(b).wire(a.out.o, b.in.i, { set: "coin" }))), ["S102"]);
});

test("every new code has a case above", () => {
  for (const c of ["S117", "S118", "S207", "S208"]) assert.ok(seen.has(c), `no case for ${c}`);
});
