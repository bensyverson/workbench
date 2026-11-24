// Probes: the generated builder under runtime probes (await, console.log, JSON, inspect, string coercion).
import { test } from "node:test";
import assert from "node:assert/strict";
import util from "node:util";
import { field } from "../../kit/define/examples/fields.js";
import { BuildError } from "../../kit/define/index.js";

const b = () => field("p").param("k", { value: 1 });

test("await a builder resolves to the builder (then is a probe)", async () => {
  const x = b();
  const y = await x;
  assert.equal(y, x);
});

test("util.inspect and console.log do not throw", () => {
  assert.doesNotThrow(() => util.inspect(b()));
  assert.doesNotThrow(() => util.inspect(b(), { showHidden: true, depth: 5 }));
  assert.doesNotThrow(() => console.log(b()));
});

test("JSON.stringify does not throw", () => {
  assert.doesNotThrow(() => JSON.stringify(b()));
});

test("Object.keys / spread / 'in' / structuredClone", () => {
  assert.doesNotThrow(() => Object.keys(b()));
  assert.doesNotThrow(() => ({ ...b() }));
  assert.doesNotThrow(() => "pixel" in b());
});

test("string coercion of a builder: coded diagnostic, not a raw TypeError", () => {
  try { String(`${b()}`); } catch (e) {
    assert.ok(e instanceof BuildError, `threw ${e?.constructor?.name}: ${e?.message}`);
  }
});

test("assert.deepEqual on two builders does not throw a raw error", () => {
  try { assert.deepEqual(b(), b()); } catch (e) {
    assert.ok(e instanceof assert.AssertionError || e instanceof BuildError, `threw ${e?.constructor?.name}: ${e?.message}`);
  }
});

test("bad args to a slot: coded diagnostics, never a raw TypeError", () => {
  const cases = [
    () => field("p").param().pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").param("k").pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").param("k", null).pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").param("k", { value: 1, options: null }).pixel("(uv, u) => color(0,0,0)").build(),
    () => field().pixel("(uv, u) => color(0,0,0)").build(),
    () => field(null).pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").fn().pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").const("K").pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").pixel(null).build(),
    () => field("p").pixel(Object.create(null)).build(),
    () => field("p").param("k", Object.create(null)).pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").param("k", { value: 1, min: 0, max: 1, extra: Symbol("s") }).pixel("(uv, u) => color(0,0,0)").build(),
    () => field("p").param("k", [1]).pixel("(uv, u) => color(0,0,0)").build(),
  ];
  const raw = [];
  cases.forEach((c, i) => { try { c(); raw.push(`${i}: no throw`); } catch (e) { if (!(e instanceof BuildError)) raw.push(`${i}: ${e?.constructor?.name} ${e?.message}`); } });
  assert.deepEqual(raw.filter((r) => !r.endsWith("no throw")), [], raw.join("\n"));
});
