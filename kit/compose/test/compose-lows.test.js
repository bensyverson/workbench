// kit/compose and kit/define: the review's six LOW findings on the seams build (each was a red probe), and point1,
// the 1-D position (ruled 2026-11-26).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, formatDiagnostic } from "../index.js";
import { defineDialect, defineGrammar, exact, vector, struct, list, name, lambda } from "../../define/index.js";

/** A small Dialect with the given ports, frames, edges and extra definition keys. @param {string} n @param {Record<string, any>} ports @param {Record<string, any>} [frames] @param {Function} [edges] @param {Record<string, any>} [extra] */
function tiny(n, ports, frames = { px: { dims: 2, note: "pixels", extent: () => ({ min: [0, 0], max: [10, 10] }) } }, edges, extra = {}) {
  const d = defineDialect(/** @type {any} */ ({
    name: n, numberType: "f64", text: () => "",
    types: { v2: vector(2, "f64"), v3: vector(3, "f64") },
    spaces: { s: { pure: true } },
    objects: { In: { label: "the inputs (inp)", members: {} } },
    globals: { inp: "In" },
    targets: { js: { accepts: "*", compare: exact() } },
    slots: { k: { params: [], returns: "f64", space: "s" } },
    state: { t: "f64", at: "v2", here: struct({ at: "v2" }) },
    frames, ...(edges ? { edges } : {}),
    ports, inputs: { object: "In", name: "inp" },
    ...extra,
  }));
  return defineGrammar(d, { root: n, constructs: { [n]: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
}
const ev = (/** @type {string} */ seam) => ({ seam, note: "n" });
const out = (/** @type {string} */ seam, from = "at") => ({ seam, from, note: "n" });
const inp = (/** @type {string} */ seam, /** @type {Record<string, any>} */ extra = { required: true }) => ({ seam, note: "n", ...extra });
/** @param {any[]} ds */
const short = (ds) => ds.map((d) => `${d.code}: ${d.message}`);
/** @param {any[]} ds */
const codes = (ds) => ds.map((d) => d.code);
/** @param {any} h */
const dialectCodes = (h) => { try { h(); return []; } catch (e) { return /** @type {any} */ (e).diagnostics?.map((/** @type {any} */ d) => d.code) ?? [String(e)]; } };

test("a record field or a frame named __proto__ is refused, not silently dropped", () => {
  const frames = { px: { dims: 2, note: "pixels" } };
  const bad = (/** @type {string} */ seam) => dialectCodes(() => tiny("pa", { out: { e: ev(seam) } }, frames));
  assert.deepEqual(bad("Event<{ __proto__: point2@px }>"), ["D025"]);
  assert.deepEqual(bad("Event<{ at: point2@__proto__ }>"), ["D025"]);
  assert.deepEqual(dialectCodes(() => tiny("pb", {}, { ["__proto__"]: { dims: 2, note: "n" } })), ["D030"]);
  assert.deepEqual(bad("Event<{ at: point2@px }>"), [], "ordinary names still pass");
});

test("a port or a frame named then is refused (its handle could never be read)", () => {
  assert.deepEqual(dialectCodes(() => tiny("pa", { out: { then: out("point2@px") } })), ["D024"]);
  assert.deepEqual(dialectCodes(() => tiny("pb", { in: { then: inp("point2@px") } })), ["D024"]);
  assert.deepEqual(dialectCodes(() => tiny("pc", {}, { then: { dims: 2, note: "n" } })), ["D030"]);
  assert.deepEqual(dialectCodes(() => tiny("pd", { out: { thenx: out("point2@px") } })), []);
});

const P = tiny("pp", { out: { x: out("point2@px"), y: out("point2@px") }, in: { x: inp("point2@px", { default: [0, 0] }), y: inp("point2@px", { default: [0, 0] }) } });
/** @param {string[]} order @param {Record<string, boolean>} [delays] */
const cycle = (order, delays = {}) => {
  const a = /** @type {any} */ (P("a")), b = /** @type {any} */ (P("b"));
  /** @type {Record<string, any[]>} */
  const ws = { ax: [a.out.x, b.in.x], ay: [a.out.y, b.in.y], bx: [b.out.x, a.in.x] };
  const c = compose("t").part(a).part(b).frame(a.frame.px, b.frame.px, { scale: 1 });
  for (const k of order) c.wire(ws[k][0], ws[k][1], delays[k] ? { delay: true } : undefined);
  return c.check();
};

test("S115: with two parallel wires closing the loop, the message and fix do not depend on .wire order, and name every wire of a hop", () => {
  const one = cycle(["ax", "ay", "bx"]), two = cycle(["ay", "ax", "bx"]), three = cycle(["bx", "ay", "ax"]);
  assert.deepEqual(codes(one), ["S115"]);
  for (const other of [two, three]) {
    assert.equal(other[0].message, one[0].message);
    assert.equal(other[0].fix, one[0].fix);
  }
  for (const w of ["a.out.x", "a.out.y", "b.out.x"]) assert.ok(one[0].message.includes(w), `${w} in ${one[0].message}`);
  // the fix: delay every wire between two neighbors of the loop
  assert.match(one[0].fix, /a\.out\.x, b\.in\.x.*a\.out\.y, b\.in\.y/);
  assert.deepEqual(cycle(["ax", "ay", "bx"], { ax: true, ay: true }), [], "delaying both parallel wires breaks the loop");
  assert.deepEqual(codes(cycle(["ax", "ay", "bx"], { ax: true })), ["S115"], "delaying one of them does not");
  assert.deepEqual(cycle(["ax", "ay", "bx"], { bx: true }), []);
});

test("S113 is not reported for an input the glue wired, though its producer is broken or the output is unknown", () => {
  const A = tiny("pa", { out: { p: out("point2@px") } });
  const C = tiny("pc", { in: { p: inp("point2@px") } });
  const a = /** @type {any} */ (A("a").k("(x) => nope")), c = /** @type {any} */ (C("c"));
  const broken = compose("t").part(a).part(c).frame(a.frame.px, c.frame.px, { scale: 1 }).wire(a.out.p, c.in.p).check();
  assert.ok(!codes(broken).includes("S113"), short(broken).join("\n"));
  assert.ok(codes(broken).includes("B008"));
  const a2 = /** @type {any} */ (A("a")), c2 = /** @type {any} */ (C("c"));
  const unknown = compose("t").part(a2).part(c2).wire(a2.out.nope, c2.in.p).check();
  assert.deepEqual(codes(unknown), ["S111"]);
  // a genuinely unwired input is still reported
  assert.deepEqual(codes(compose("t").part(A("a")).part(C("c")).check()), ["S113"]);
});

test("S251 between the kit's s and a package's own 1-dim frame says s relates to no package frame, and offers no .frame on s", () => {
  const S1 = tiny("sa", { out: { d: { seam: "f64@s", from: "t", note: "n" } } });
  const MS = tiny("sm", { in: { d: inp("f64@ms") } }, { ms: { dims: 1, note: "milliseconds" } });
  const a = /** @type {any} */ (S1("a")), b = /** @type {any} */ (MS("b"));
  const ds = compose("t").part(a).part(b).wire(a.out.d, b.in.d).check();
  assert.deepEqual(codes(ds), ["S251"]);
  assert.ok(!/\.frame\(a\.frame\.s/.test(ds[0].fix), ds[0].fix);
  assert.match(ds[0].fix, /s relates to no package frame/);
  assert.match(formatDiagnostic(ds[0]), /fix: .*relates to no package frame/);
});

test("S205: a wire may rename the fields of a list of records, as an Event may", () => {
  const state = { t: "f64", at: "v2", here: struct({ at: "v2" }), items: list(struct({ pos: "v2" }), 4) };
  const L1 = tiny("la", { out: { l: { seam: "list<{ pos: point2@px }, 4>", from: "items", note: "n" } } }, undefined, undefined, { state });
  const L2 = tiny("lb", { in: { l: inp("list<{ at: point2@px }, 4>") } });
  const l1 = /** @type {any} */ (L1("a")), l2 = /** @type {any} */ (L2("b"));
  const c = compose("t").part(l1).part(l2).frame(l1.frame.px, l2.frame.px, { scale: 1 }).wire(l1.out.l, l2.in.l, { rename: { pos: "at" } });
  assert.deepEqual(short(c.check()), []);
  assert.deepEqual(c.build().wires[0].rename, { pos: "at" });
  assert.deepEqual(c.build().wires[0].convert.map((/** @type {any} */ x) => x.field), ["[].at"], "the conversion names the consumer's field");
  // a rename on a wire with no record is still refused
  const Sc = tiny("sc", { out: { v: out("f64", "t") } }), Sd = tiny("sd", { in: { v: inp("f64") } });
  const sc = /** @type {any} */ (Sc("a")), sd = /** @type {any} */ (Sd("b"));
  assert.deepEqual(codes(compose("t").part(sc).part(sd).wire(sc.out.v, sd.in.v, { rename: { a: "b" } }).check()), ["S205"]);
});

const C1 = tiny("ta", { out: { temp: { seam: "point1@c", from: "t", note: "air temperature, degrees Celsius" } } }, { c: { dims: 1, note: "degrees Celsius" } });
const F1 = tiny("tb", { in: { temp: inp("point1@f") } }, { f: { dims: 1, note: "degrees Fahrenheit" } });

test("point1: a 1-D position converts by scale and offset (100 C is 212 F)", () => {
  const a = /** @type {any} */ (C1("a")), b = /** @type {any} */ (F1("b"));
  const c = compose("t").part(a).part(b).frame(a.frame.c, b.frame.f, { scale: 1.8, offset: 32 }).wire(a.out.temp, b.in.temp);
  assert.deepEqual(short(c.check()), []);
  const conv = c.build().wires[0].convert;
  assert.deepEqual(conv, [{ field: "", kind: "point", from: "ta.c", to: "tb.f", scale: [1.8], offset: [32] }]);
  assert.match(c.plan()[0], /point, ×1\.8 \+32/);
});

test("point1 is not a quantity, a vector or a 2-D point; point1@s is an instant needing no .frame", () => {
  const Q = tiny("tq", { in: { temp: inp("f64@f") } }, { f: { dims: 1, note: "F" } });
  const a = /** @type {any} */ (C1("a")), q = /** @type {any} */ (Q("q"));
  const ds = compose("t").part(a).part(q).frame(a.frame.c, q.frame.f, { scale: 1.8, offset: 32 }).wire(a.out.temp, q.in.temp).check();
  assert.deepEqual(codes(ds), ["S201"], "a position does not feed a quantity");
  const T = tiny("t1", { out: { now: { seam: "point1@s", from: "t", note: "the instant" } } });
  const U = tiny("t2", { in: { at: inp("point1@s") } });
  const t = /** @type {any} */ (T("a")), u = /** @type {any} */ (U("b"));
  const c = compose("t").part(t).part(u).wire(t.out.now, u.in.at);
  assert.deepEqual(short(c.check()), []);
  assert.deepEqual(c.build().wires[0].convert, [{ field: "", kind: "point", from: "s", to: "s", scale: [1], offset: [0] }]);
  assert.deepEqual(dialectCodes(() => tiny("t3", { out: { p: out("point1@px", "t") } })), ["D025"], "a 2-dim frame is not a 1-D position's");
  assert.deepEqual(dialectCodes(() => tiny("t4", { out: { p: out("point2@c") } }, { c: { dims: 1, note: "n" } })), ["D025"]);
});

test("point1 pairs with a plain f64 state and reads as a number", () => {
  const A = tiny("pa", { out: { p: { seam: "point1@c", from: "t", note: "n" } }, in: {} }, { c: { dims: 1, note: "n" } });
  assert.ok(A("a"));
  assert.deepEqual(dialectCodes(() => tiny("pb", { out: { p: { seam: "point1@c", from: "at", note: "n" } } }, { c: { dims: 1, note: "n" } })), ["D027"], "a v2 state is not a 1-D position");
});
