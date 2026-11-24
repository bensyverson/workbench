// Lowering a whole program: event payloads and method signatures inferred across lambdas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "./fixture.js";
import { lowerProgram } from "../index.js";

const LAMBDAS = [
  { src: "(w, e) => { if (w.board.at(e.cell).whack()) w.toast(\"WHACK\", \"+100\"); }", slot: { id: "g.on(whack)#0", kind: "on", on: "World", key: "whack" } },
  { src: "(self) => { if (!self.up) return false; self.up = false; self.world.award(100); return true; }", slot: { id: "Mole.method(whack)", kind: "method", on: "Mole", key: "whack" } },
  { src: "(self, pts) => { self.score = self.score + pts; }", slot: { id: "World.method(award)", kind: "method", on: "World", key: "award" } },
  { src: "(self, w) => { if (w.input.pressed(\"A\")) w.emit(\"whack\", { cell: self.cell }); }", slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } },
];

test("payloads come from emit sites and method signatures from bodies and call sites", () => {
  const { results, sigs } = lowerProgram(environment, LAMBDAS);
  for (const r of results) assert.deepEqual(r.diagnostics.map((d) => `${d.code} ${d.message}`), []);
  assert.deepEqual(sigs.events.whack, { struct: { cell: "f64" } });
  assert.deepEqual(sigs.methods["Mole.whack"].returns, "bool");
  assert.deepEqual(sigs.methods["World.award"].params, ["f64"]);
  assert.ok(sigs.methods["Mole.whack"].effects.includes("write World.score"), "a method's effects include its callees'");
  const handler = results[0].kernel;
  assert.deepEqual(handler?.params[1].t, { struct: { cell: "f64" } });
});

test("a payload field no emit site sends is an unknown member", () => {
  const bad = [...LAMBDAS, { src: "(w, e) => { w.next = e.row; }", slot: { id: "g.on(whack)#1", kind: "on", on: "World", key: "whack" } }];
  const { results } = lowerProgram(environment, bad);
  assert.deepEqual(results[4].diagnostics.map((d) => d.code), ["L002"]);
  assert.deepEqual(results[0].diagnostics, []);
});

test("emit sites that disagree on a payload are a signature conflict", () => {
  const bad = [...LAMBDAS, { src: "(w) => { w.emit(\"whack\", { cell: \"x\" }); }", slot: { id: "timer(t)", kind: "timer", on: "World" } }];
  const { results } = lowerProgram(environment, bad);
  assert.deepEqual(results[4].diagnostics.map((d) => d.code), ["L014"]);
});
