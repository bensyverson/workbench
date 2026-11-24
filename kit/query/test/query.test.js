// The queries over Kernels, on real DMG and fields Kernels and on small hand-built ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { walk, isStmt, reachableHelpers, reads, writers, impurities, isPure } from "../index.js";
import { lowerField } from "../../dialects/fields/index.js";
import { swirl } from "../../dialects/fields/programs/uv-remaps.js";
import { domainWarp } from "../../dialects/fields/programs/domain-warp.js";
import { loadDmg } from "../../../scripts/dmg-oracle/load.js";
import { lowerPreset } from "../../../scripts/dmg-lower/pipeline.js";
import * as c from "../../interp/test/build.js";

/** @import { Kernel, Expr, Effect, Type } from "../../ir/ir.js" */
/** @import { FieldProgram } from "../../dialects/fields/decls.js" */

/** @param {FieldProgram} program */
function fieldKernels(program) {
  const l = lowerField(program);
  const helpers = l.helpers.filter((h) => h.kind === "fn" && h.result.kernel).map((h) => /** @type {Kernel} */ (h.result.kernel));
  return { main: /** @type {Kernel} */ (l.kernel), helpers };
}

const dmg = loadDmg();
/** @param {string} id */
function dmgKernels(id) {
  const { entries, helpers } = lowerPreset(dmg, id);
  /** @type {Map<string, Kernel>} */
  const slots = new Map();
  for (const e of entries) if (e.result.kernel) slots.set(e.slot.id, e.result.kernel);
  return { slots, helpers: helpers.flatMap((h) => (h.result.kernel ? [h.result.kernel] : [])) };
}
/** @param {Map<string, Kernel>} slots @param {string} id */
const slot = (slots, id) => /** @type {Kernel} */ (slots.get(id));

const MOLE = /** @type {Type} */ ({ ref: "Mole" });
const ttl = c.place(c.local("self", MOLE), "Mole", "ttl", "f64", { type: "u16" });
const up = c.place(c.local("self", MOLE), "Mole", "up", "bool", { type: "bool" });

/** A helper kernel as lowering makes one: slot `helper`, space `helper <name>`. @param {Kernel} k */
const asHelper = (k) => ({ ...k, slot: "helper", space: `helper ${k.name}` });

// walk

test("walk visits every statement and expression of a Kernel, each before its children, in evaluation order", () => {
  const k = c.kernel({ params: [["self", MOLE]], body: [
    c.if_(c.load(up), [c.store(ttl, c.op("sub", "f64", c.load(ttl), c.num(1)))]),
  ] });
  /** @type {string[]} */
  const seen = [];
  walk(k, (n) => seen.push(n.k));
  assert.deepEqual(seen, ["if", "load", "local", "store", "local", "op", "load", "local", "num"]);
});

test("walk takes a statement list, one statement or one expression as its region", () => {
  const body = [c.let_("x", "f64", c.num(1)), c.ret(c.local("x"))];
  /** @type {string[]} */
  const seen = [];
  walk(body, (n) => seen.push(n.k));
  assert.deepEqual(seen, ["let", "num", "return", "local"]);
  seen.length = 0;
  walk(c.op("add", "f64", c.num(1), c.num(2)), (n) => seen.push(n.k));
  assert.deepEqual(seen, ["op", "num", "num"]);
});

test("isStmt tells a statement from an expression, a `let` (which has a type) and a call (which has effects) included", () => {
  assert.equal(isStmt(c.let_("x", "f64", c.num(1))), true);
  assert.equal(isStmt(c.brk), true);
  assert.equal(isStmt(c.call("mix", "f32", [])), false);
  assert.equal(isStmt(c.num(1)), false);
});

// reachableHelpers

test("reachableHelpers: fields helpers in the order first reached, through other helpers", () => {
  const s = fieldKernels(swirl);
  assert.deepEqual(reachableHelpers(s.main, s.helpers).map((h) => h.name), ["grid", "pmod"]);
  const d = fieldKernels(domainWarp);
  assert.deepEqual(reachableHelpers(d.main, d.helpers).map((h) => h.name), ["fbm", "vnoise"]);
});

test("reachableHelpers: a DMG slot that calls a top-level helper reaches it; one that calls none reaches nothing", () => {
  const { slots, helpers } = dmgKernels("14");
  assert.deepEqual(reachableHelpers(slot(slots, "memory.onFrame#0"), helpers).map((h) => h.name), ["nth"]);
  assert.deepEqual(reachableHelpers(slot(slots, "Mole.onFrame#0"), helpers), []);
});

test("reachableHelpers: a helper reached twice is listed once, an unknown helper is skipped, and a region narrows it", () => {
  const g = asHelper(c.kernel({ name: "g", params: [["x", "f64"]], returns: "f64", body: [c.ret(c.local("x"))] }));
  const twice = c.op("add", "f64", c.helper("g", "f64", [c.num(1)]), c.helper("g", "f64", [c.num(2)]));
  const k = c.kernel({ returns: "f64", body: [c.let_("y", "f64", c.helper("mystery", "f64", [])), c.ret(twice)] });
  assert.deepEqual(reachableHelpers(k, [g]).map((h) => h.name), ["g"]);
  assert.deepEqual(reachableHelpers(k.body.slice(0, 1), [g]), []);
});

// reads

test("reads: a fields pixel loads its uniforms, which are read-only places, not state", () => {
  const s = fieldKernels(swirl);
  const r = reads(s.main, { helpers: s.helpers });
  assert.deepEqual(r.loads.map((l) => l.place), ["Uniforms.cx", "Uniforms.cy", "Uniforms.angle"]);
  assert.ok(r.loads.every((l) => !l.state && l.owner === "Uniforms" && l.kernel === "swirl.pixel"));
});

test("reads: looks through helpers, naming the Kernel each call was found in", () => {
  const s = fieldKernels(swirl);
  const r = reads(s.main, { helpers: s.helpers });
  assert.deepEqual(r.helpers.map((h) => h.name), ["grid", "pmod"]);
  const sites = r.calls.map((x) => `${x.kernel}: ${x.k} ${x.fn}`);
  assert.deepEqual(sites.filter((x) => x.startsWith("swirl.pixel")), ["swirl.pixel: call length", "swirl.pixel: call sin", "swirl.pixel: call cos", "swirl.pixel: helper grid"]);
  assert.ok(sites.includes("grid: helper pmod"));
  assert.ok(sites.includes("pmod: call floor"));
  assert.equal(sites.filter((x) => x === "pmod: call floor").length, 1, "a helper's body is read once however often it is called");
});

test("reads: without the helpers, a helper call is only a call", () => {
  const s = fieldKernels(swirl);
  const r = reads(s.main);
  assert.deepEqual(r.helpers, []);
  assert.ok(r.calls.every((x) => x.kernel === "swirl.pixel"));
});

test("reads: a DMG slot loads state, and a call carries its own read effects (`read param pace`)", () => {
  const { slots, helpers } = dmgKernels("14");
  const r = reads(slot(slots, "memory.onFrame#0"), { helpers });
  assert.deepEqual([...new Set(r.loads.map((l) => l.place))], ["World.phase", "World.clock", "World.pos", "World.len", "World.board", "World.seed"]);
  assert.deepEqual([...new Set(r.loads.filter((l) => !l.state).map((l) => l.place))], ["World.board"], "the board is read-only, so its load is no `read` effect");
  const param = r.calls.find((x) => x.effects.includes("read param pace"));
  assert.ok(param, "the param read is a call's effect");
  assert.equal(param.k, "call");
  assert.deepEqual(r.helpers.map((h) => h.name), ["nth"]);
});

test("reads: a region inside a Kernel reads only what it holds", () => {
  const { slots } = dmgKernels("04");
  const k = slot(slots, "Mole.onFrame#0");
  const first = k.body[0];
  assert.equal(first.k, "if");
  const then = /** @type {import("../../ir/ir.js").Stmt[]} */ (first.k === "if" ? first.then : []);
  const r = reads(then, { kernel: k.name });
  assert.deepEqual([...new Set(r.loads.map((l) => l.place))], ["Mole.ttl"]);
  assert.ok(r.loads.every((l) => l.kernel === "Mole.onFrame#0"));
  assert.deepEqual([...new Set(reads(k).loads.map((l) => l.place))], ["Mole.up", "Mole.ttl"]);
});

test("reads: a method call is reported, not looked through", () => {
  const m = c.method("Mole", "hit", c.local("self", MOLE), "void", []);
  const r = reads(c.do_(m, ["call Mole.hit"]));
  assert.deepEqual(r.calls.map((x) => `${x.k} ${x.fn}`), ["method Mole.hit"]);
  assert.deepEqual(r.calls[0].effects, ["call Mole.hit"]);
});

// writers

test("writers: every DMG store to a place, across the program's Kernels", () => {
  const { slots } = dmgKernels("14");
  const all = [...slots.values()];
  const lit = writers(all, "Mole.lit");
  assert.deepEqual([...new Set(lit.map((w) => w.kernel))], ["memory.onFrame#0", "memory.on(guess)#0", "Mole.onFrame#0"]);
  assert.ok(lit.every((w) => w.via === "store" && w.place === "Mole.lit" && w.node.k === "store"));
  assert.equal(writers(all, "World.pos").filter((w) => w.kernel === "memory.onFrame#0").length, 2, "both stores in memory.onFrame, one site each");
});

test("writers: a call or method whose recorded effects write the place counts, by how it writes", () => {
  const scroll = c.call("w.bg.scroll", "void", [c.num(1)], { effects: ["write bg.scroll"] });
  const hit = /** @type {Expr} */ ({ ...c.method("Mole", "hit", c.local("self", MOLE), "void", []), effects: /** @type {Effect[]} */ (["call Mole.hit", "write Mole.ttl"]) });
  const k = c.kernel({ params: [["self", MOLE]], body: [c.do_(scroll), c.do_(hit), c.store(ttl, c.num(3))] });
  assert.deepEqual(writers([k], "bg.scroll").map((w) => w.via), ["call"]);
  assert.deepEqual(writers([k], "Mole.ttl").map((w) => w.via), ["method", "store"]);
  assert.deepEqual(writers([k], "Mole.up"), []);
});

test("writers: nothing in a fields Program writes, uniforms included", () => {
  const d = fieldKernels(domainWarp);
  assert.deepEqual(writers([d.main, ...d.helpers], "Uniforms.k"), []);
});

// purity

test("impurities: the fields sketches are pure, helper calls looked through", () => {
  for (const p of [swirl, domainWarp]) {
    const { main, helpers } = fieldKernels(p);
    assert.deepEqual(impurities(main, helpers).map((i) => [i.kernel.name, i.effects]), [[main.name, []], ...reachableHelpers(main, helpers).map((h) => [h.name, []])]);
    assert.equal(isPure(main, helpers), true);
  }
});

test("impurities: a DMG slot's effects, minus calls of helpers it was given", () => {
  const { slots, helpers } = dmgKernels("14");
  const k = slot(slots, "memory.onFrame#0");
  const [own, nth] = impurities(k, helpers);
  assert.equal(own.kernel, k);
  assert.ok(!own.effects.includes("call nth"));
  assert.ok(own.effects.includes("write Mole.lit"));
  assert.deepEqual([nth.kernel.name, nth.effects], ["nth", []]);
  assert.ok(impurities(k, [])[0].effects.includes("call nth"), "a helper not given is an effect like any call");
  assert.equal(isPure(k, helpers), false);
});

test("impurities: an effectful helper is named, and `allow` admits effects the caller accepts", () => {
  const noisy = { ...asHelper(c.kernel({ name: "noisy", returns: "f64", body: [c.ret(c.num(1))] })), effects: /** @type {Effect[]} */ (["rng"]) };
  const main = { ...c.kernel({ name: "p#0", returns: "f64", body: [c.ret(c.helper("noisy", "f64", []))] }), effects: /** @type {Effect[]} */ (["call noisy", "read Uniforms.a", "read Mole.ttl"]) };
  assert.deepEqual(impurities(main, [noisy]).map((i) => [i.kernel.name, i.effects]), [["p#0", ["read Uniforms.a", "read Mole.ttl"]], ["noisy", ["rng"]]]);
  const allow = (/** @type {Effect} */ e) => e.startsWith("read Uniforms.");
  assert.deepEqual(impurities(main, [noisy], allow).map((i) => i.effects), [["read Mole.ttl"], ["rng"]]);
});
