// Program-derived tables (events, helpers) are still read with `[name]` / `in`: a DMG event named like an
// Object.prototype member is refused, and a helper-table hit by `toString` gives the wrong L013 message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { environment } from "./fixture.js";
import { lowerProgram } from "../index.js";

const codes = (/** @type {string} */ ev) => {
  const L = [
    { src: `(w, e) => { w.score = e.cell; }`, slot: { id: `g.on(${ev})#0`, kind: "on", on: "World", key: ev } },
    { src: `(self, w) => { if (w.input.pressed("A")) w.emit("${ev}", { cell: self.cell }); }`, slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } },
  ];
  return lowerProgram(environment, L).results.map((r) => r.diagnostics.map((d) => `${d.code} ${d.message}`));
};

test("control: an ordinary event name lowers clean", () => {
  assert.deepEqual(codes("whack"), [[], []]);
});

for (const ev of ["toString", "constructor", "valueOf"]) {
  test(`an event named ${ev} lowers like any other`, () => {
    assert.deepEqual(codes(ev), [[], []]);
  });
}

test("assigning to `toString` in DMG is not called a top-level function of the program", () => {
  const r = lowerProgram(environment, [{ src: "(self, w) => { toString = 1; }", slot: { id: "Hammer.onFrame#0", kind: "onFrame", on: "Hammer" } }]);
  const d = r.results[0].diagnostics.map((x) => `${x.code} ${x.message}`);
  assert.equal(d.length, 1, d.join("\n"));
  assert.doesNotMatch(d[0], /top-level function of the program/);
});
