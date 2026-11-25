// Per-slot effects in the IR (leaf 8vQJOw): a total is a place a Kernel only adds to, with the `bump`
// statement and the `bump Owner.name` effect; reading one records a read; the `value` store rule stores a
// value unchanged, of any type, and refuses nothing. Each consumer of statements learns the new one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "../verify.js";
import { printKernel } from "../print.js";
import { run } from "../../interp/index.js";
import { coerce } from "../../interp/coerce.js";
import { emitKernel, instantiate } from "../../emit/js/emit.js";
import { lowerToLir } from "../../lir/index.js";
import { walk } from "../../query/index.js";

/** @import { Kernel, Expr, Stmt, Type, Place, Effect } from "../ir.js" */

const SRC = "x".repeat(100);
/** @type {[number, number]} */
const S = [0, 10];
const C = /** @type {Type} */ ({ obj: "Counters" });
const P = /** @type {Type} */ ({ ref: "Particle" });
const V2 = /** @type {Type} */ ({ vec: 2, of: "f64", name: "vec2" });

/** @returns {Expr} */ const num = (/** @type {number} */ v) => ({ k: "num", v, t: "f64", span: S });
/** @returns {Expr} */ const local = (/** @type {string} */ name, /** @type {Type} */ t) => ({ k: "local", name, t, span: S });
/** @returns {Place} */ const total = (/** @type {string} */ name) => ({ recv: local("c", C), owner: "Counters", name, t: "f64", total: true });

/**
 * A kernel over `c` (the counters) and `p` (a particle) with this body.
 * @param {Stmt[]} body @param {Effect[]} [effects]  the kernel's effects; by default its statements', deduplicated
 * @returns {Kernel}
 */
function kernel(body, effects) {
  return {
    ir: "kernel", name: "update#0", slot: "update", space: "particle",
    params: [{ name: "p", t: P, kind: "param" }, { name: "c", t: C, kind: "param" }],
    returns: "void", locals: [], body,
    effects: effects ?? [...new Set(body.flatMap((s) => s.effects))], src: SRC, span: [0, 100],
  };
}

/** @returns {Stmt} */
const bump = (/** @type {string} */ name, /** @type {Expr} */ value, /** @type {Effect[]} */ effects = [`bump Counters.${name}`]) => ({ k: "bump", place: total(name), value, span: S, effects });

const codes = (/** @type {Kernel} */ k) => verify(k).map((d) => d.code);

test("a bump of a total, recording its effect, verifies clean", () => {
  assert.deepEqual(verify(kernel([bump("hits", num(1))])), []);
});

test("a bump that does not record `bump Owner.name` is V007", () => {
  assert.deepEqual(codes(kernel([bump("hits", num(1), [])])), ["V007"]);
});

test("a bump of a place that is not a total is V006", () => {
  /** @type {Stmt} */
  const s = { k: "bump", place: { recv: local("c", C), owner: "Counters", name: "hits", t: "f64" }, value: num(1), span: S, effects: ["bump Counters.hits"] };
  assert.deepEqual(codes(kernel([s])), ["V006"]);
});

test("a bump adds an f64: a bool value, or a total typed other than f64, is V002", () => {
  assert.deepEqual(codes(kernel([bump("hits", { k: "bool", v: true, t: "bool", span: S })])), ["V002"]);
  /** @type {Stmt} */
  const s = { k: "bump", place: { ...total("hits"), t: "f32" }, value: { k: "num", v: 1, t: "f32", span: S }, span: S, effects: ["bump Counters.hits"] };
  assert.deepEqual(codes(kernel([s])), ["V002"]);
});

test("a total is never also writable: a place with both `total` and `store` is V006", () => {
  /** @type {Stmt} */
  const s = { k: "bump", place: { ...total("hits"), store: { type: "f64" } }, value: num(1), span: S, effects: ["bump Counters.hits"] };
  assert.deepEqual(codes(kernel([s])), ["V006"]);
});

test("reading a total records `read Owner.name`; leaving it out is V007", () => {
  /** @type {Expr} */
  const read = { k: "load", place: total("hits"), t: "f64", span: S };
  assert.deepEqual(verify(kernel([{ k: "do", value: read, span: S, effects: ["read Counters.hits"] }])), []);
  assert.deepEqual(codes(kernel([{ k: "do", value: read, span: S, effects: [] }])), ["V007"]);
});

test("`bump` is an effect verb; a malformed one is still V007", () => {
  assert.deepEqual(codes(kernel([bump("hits", num(1), ["bump Counters.hits", /** @type {Effect} */ ("bumpy Counters.hits")])])), ["V007"]);
});

test("the value store rule fits a vector place and a number place", () => {
  /** @param {Type} t @returns {Stmt} */
  const store = (t) => ({ k: "store", place: { recv: local("p", P), owner: "Particle", name: "vel", t, store: { type: "value" } }, value: t === "f64" ? num(1) : { k: "vec", items: [num(1), num(2)], t, span: S }, span: S, effects: ["write Particle.vel"] });
  assert.deepEqual(verify(kernel([store(V2)])), []);
  assert.deepEqual(verify(kernel([store("f64")])), []);
});

test("the value rule stores what it is given, non-finite numbers and vectors unchanged", () => {
  assert.equal(coerce({ type: "value" }, NaN), NaN);
  assert.equal(coerce({ type: "value" }, Infinity), Infinity);
  const v = [1, 2];
  assert.equal(coerce({ type: "value" }, v), v);
});

test("the listing shows a bump with its effect", () => {
  const text = printKernel(kernel([bump("hits", num(2))]));
  assert.match(text, /bump c\.hits, 2\s+; bump Counters\.hits/);
});

test("the interpreter adds into the total on the host's object", () => {
  const c = { hits: 1 };
  run(kernel([bump("hits", num(2)), bump("hits", num(0.5))]), [{}, c]);
  assert.equal(c.hits, 3.5);
});

test("a host with a bump hook performs the bump itself", () => {
  /** @type {Array<[string, unknown, unknown]>} */
  const seen = [];
  const c = { hits: 1 };
  run(kernel([bump("hits", num(2))]), [{}, c], { host: { bump: (place, recv, value) => seen.push([place.name, recv, value]) } });
  assert.deepEqual(seen, [["hits", c, 2]]);
  assert.equal(c.hits, 1);
});

test("a value store keeps a non-finite number and does not throw", () => {
  const p = { life: 1 };
  /** @type {Stmt} */
  const s = { k: "store", place: { recv: local("p", P), owner: "Particle", name: "life", t: "f64", store: { type: "value" } }, value: { k: "op", op: "div", args: [num(1), num(0)], t: "f64", span: S }, span: S, effects: ["write Particle.life"] };
  run(kernel([s]), [p, {}]);
  assert.equal(p.life, Infinity);
});

test("the JS backend emits a bump as += on the host's object, and it runs", () => {
  const e = emitKernel(kernel([bump("hits", num(2))]));
  assert.match(e.source, /c\.hits \+= 2;/);
  const f = /** @type {(p: unknown, c: { hits: number }) => void} */ (instantiate(e));
  const c = { hits: 1 };
  f({}, c);
  assert.equal(c.hits, 3);
});

test("the LIR refuses a bump: nothing in a shader holds state", () => {
  const r = lowerToLir({ name: "t", main: kernel([bump("hits", num(1))]), helpers: [], uniforms: {} }, { spell: () => null });
  assert.equal(r.program, null);
  assert.ok(r.diagnostics.some((d) => d.code === "R002" && /Counters\.hits/.test(d.message)), JSON.stringify(r.diagnostics));
});

test("the query walk visits a bump's receiver and value", () => {
  const value = num(7);
  /** @type {unknown[]} */
  const seen = [];
  walk(kernel([bump("hits", value)]), (n) => { seen.push(n); });
  assert.ok(seen.includes(value));
});
