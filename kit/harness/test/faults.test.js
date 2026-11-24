import { test } from "node:test";
import assert from "node:assert/strict";
import { swapOperator, nudgeConstant, swizzle, replaceText, FAULTS } from "../faults.js";
import { prepare } from "../pipeline.js";
import { standardCases } from "../cases.js";
import { referencePixels, compareJs } from "../run.js";
import { swirl } from "../../dialects/fields/programs/uv-remaps.js";

const [swirlCase] = standardCases(0.2);

/**
 * Plants a fault in the JS target of swirl and compares it with the unplanted interpreter.
 * @param {import("../pipeline.js").Plant} plant */
function jsRun(plant) {
  const p = prepare(swirl, plant);
  return { p, ...compareJs(p, swirlCase, referencePixels(prepare(swirl), swirlCase)) };
}

test("swapOperator edits the nth matching node and names the source it changed", () => {
  const fault = swapOperator("pixel", (e) => e.op === "sub" && typeof e.t === "object", "add");
  const plant = /** @type {const} */ ({ target: "js", ir: fault.ir });
  const { p, pair } = jsRun(plant);
  assert.equal(p.planted, true);
  assert.deepEqual(fault.sites, ["uv * 150 - c"]);
  assert.equal(pair.exact, false);
});

test("a fault that matches nothing throws instead of planting nothing", () => {
  const fault = swapOperator("pixel", (e) => e.op === "pow", "mul");
  assert.throws(() => prepare(swirl, { target: "js", ir: fault.ir }), /matched no node|only has/);
});

test("nth chooses among matches: the second `mul` is a different site from the first", () => {
  const a = swapOperator("pixel", (e) => e.op === "mul", "add", 0);
  const b = swapOperator("pixel", (e) => e.op === "mul", "add", 1);
  prepare(swirl, { target: "js", ir: a.ir });
  prepare(swirl, { target: "js", ir: b.ir });
  assert.notDeepEqual(a.sites, b.sites);
});

test("nudgeConstant rounds the new value to an f32, and keeps the kernel's own copy intact", () => {
  const fault = nudgeConstant("pixel", (e) => e.v === 63, 0.5);
  const p = prepare(swirl, { target: "js", ir: fault.ir });
  assert.equal(p.planted, true);
  assert.equal(/** @type {any} */ (p.kernels.pixel.body[0]).value.v, 63, "the interpreter's kernel is untouched");
  assert.match(p.jsEmitted.source, /63\.5/);
  assert.deepEqual(fault.sites, ["63"]);
});

test("swizzle moves a component read", () => {
  const fault = swizzle("pixel", (e) => e.name === "x", "y");
  const { pair } = jsRun({ target: "js", ir: fault.ir });
  assert.equal(pair.exact, false);
  assert.match(fault.sites[0], /d\.x/);
});

test("replaceText replaces the nth occurrence and leaves the rest", () => {
  assert.equal(replaceText("a a a", "a", "b", 1)("a a a"), "a b a");
  assert.equal(replaceText("a a a", "a", "b")("a a a"), "b a a");
  assert.equal(replaceText("x", "a", "b")("x"), "x");
});

test("every fault of the list names a case and a kind, and at least one target", () => {
  assert.ok(FAULTS.length >= 20);
  const ids = new Set(FAULTS.map((f) => f.id));
  assert.equal(ids.size, FAULTS.length);
  for (const f of FAULTS) {
    assert.ok(["swirl", "bulge", "domain-warp"].includes(f.case), f.id);
    assert.ok(["operator", "constant", "swizzle", "rounding", "spelling"].includes(f.kind), f.id);
    assert.ok(f.targets.length > 0, f.id);
  }
  for (const kind of ["operator", "constant", "swizzle", "rounding"]) assert.ok(FAULTS.some((f) => f.kind === kind), kind);
});
