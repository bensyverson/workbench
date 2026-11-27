// The IR's text listing, for people: one statement per line, effects as comments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printKernel, showType } from "../index.js";
import { lower } from "../../lower/test/fixture.js";

test("a kernel prints as a listing with its iteration space, types, coercing stores and effects", () => {
  const r = lower("(self) => { if (self.up && --self.ttl === 0) self.up = false; }");
  assert.ok(r.kernel);
  assert.equal(printKernel(r.kernel), [
    "kernel Mole.onFrame(self: Mole) -> void    ; entity Mole",
    "  ; effects: read Mole.up, read Mole.ttl, write Mole.ttl, write Mole.up",
    "  if self.up {                             ; read Mole.up",
    "    let t0: f64 = sub(self.ttl, 1)         ; read Mole.ttl",
    "    store.u16 self.ttl, t0                 ; write Mole.ttl",
    "    if eq(t0, 0) {",
    "      store.bool self.up, false            ; write Mole.up",
    "    }",
    "  }",
    "",
  ].join("\n"));
});

test("queries print as their loops, and stores show their bounds", () => {
  const r = lower("(w) => { w.score = w.board.filter((m) => !m.up).length; }", "timer", "World");
  assert.ok(r.kernel);
  const text = printKernel(r.kernel);
  assert.match(text, /let t0: \[Mole; 9\] = \[\]/);
  assert.match(text, /each m in w\.board \(≤ 9\) \{/);
  assert.match(text, /push t0, m/);
  assert.match(text, /store\.u16\[\.\.9999\] w\.score, t0\.length/);
});

test("types print compactly", () => {
  assert.equal(showType({ opt: { ref: "Mole" } }), "Mole?");
  assert.equal(showType({ list: { ref: "Spark" }, max: 24 }), "[Spark; 24]");
  assert.equal(showType({ struct: { x: "f64", y: "f64" }, optional: ["y"] }), "{x: f64, y?: f64}");
  assert.equal(showType({ enum: ["a", "b"] }), "\"a\"|\"b\"");
  assert.equal(showType({ union: ["str", "null"] }), "str | null");
  assert.equal(showType({ obj: "World" }), "World");
});

test("a kernel with needs lists them after its effects, and one without prints no needs line", () => {
  const r = lower("(self) => { self.ttl = 1; }");
  assert.ok(r.kernel);
  assert.doesNotMatch(printKernel(r.kernel), /needs/);
  const needy = { ...r.kernel, needs: [{ need: /** @type {const} */ ("loop"), span: /** @type {[number, number]} */ ([0, 4]) }, { need: /** @type {const} */ ("heap"), span: /** @type {[number, number]} */ ([5, 9]), via: "rank" }] };
  assert.match(printKernel(needy), /^  ; needs: loop \(0\.\.4\), heap \(5\.\.9, via rank\)$/m);
});
