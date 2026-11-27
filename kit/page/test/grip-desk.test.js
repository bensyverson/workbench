// @ts-nocheck: the stubs stand in for the page's own closures.
// The Grips block of createPage, alone (grip-desk.js): `createGripDesk` takes the page's seams (its parts' UIs and
// compiled records, the run's state and params, the shown view, the write problem and the preview) as functions, so a
// test drives it with stubs. A lens-shaped part with one radius Grip per item, and a drag that previews and releases.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGripDesk } from "../grip-desk.js";

/** The block over stubs: part `b` with a `radius` Grip per lens in its state; the second lens's target cannot be written. */
function desk() {
  const previews = [], reports = [];
  const ui = { grips: { radius: { kind: "length", each: "lenses", to: "to", at: "at", axis: "axis" } }, stage: { draw: "view" } };
  const compiled = { value: (what, item) => ({ "grips.radius.to": item.to, "grips.radius.at": item.at, "grips.radius.axis": [1, 0] })[what] };
  const g = createGripDesk({
    composed: { parts: [{ name: "page", dialect: "page" }, { name: "b", dialect: "lens" }] },
    uiOfPart: (part) => (part === "b" ? ui : null),
    compiledOf: () => compiled,
    state: () => ({ lenses: [{ to: "arg.b.lens#0:0.radius", at: [5, 6] }, { to: "arg.b.lens#9:0.radius", at: [7, 8] }] }),
    params: () => ({}),
    view: () => null,
    composedNow: () => ({ parts: [] }),
    siteOf: () => ({ value: 10, min: 0, max: 40 }),
    writeProblem: (_part, to) => (to.includes("#9") ? { code: "H011", message: "no call is there" } : null),
    preview: (part, to, value, what) => { previews.push({ part, to, value, what }); return true; },
    report: (d) => reports.push(d),
    now: () => "0",
  });
  return { g, previews, reports };
}

test("createGripDesk lists each item's Grip, a disabled one with its H011 reported once", () => {
  const { g, reports } = desk();
  const list = g.list();
  assert.deepEqual(list.map((x) => [x.part, x.grip, x.index, x.to, x.disabled?.code ?? null]), [["b", "radius", 0, "arg.b.lens#0:0.radius", null], ["b", "radius", 1, "arg.b.lens#9:0.radius", "H011"]]);
  g.list();
  assert.equal(reports.filter((d) => d.code === "H011").length, 1);
});

test("createGripDesk: a drag previews the latest value on flush, and its release gives the commit", () => {
  const { g, previews } = desk();
  const drag = g.grab({ part: "b", grip: "radius", index: 0 }, [0, 0]);
  drag.move([5, 0]);
  drag.move([8, 0]);
  assert.deepEqual(previews, []);
  g.flush();
  assert.deepEqual(previews.map((p) => [p.to, p.value]), [["arg.b.lens#0:0.radius", 18]]);
  drag.move([100, 0]);
  assert.deepEqual(drag.release(), { to: "arg.b.lens#0:0.radius", value: 40 });
  g.flush();
  assert.equal(previews.length, 2, "a released drag has nothing left to flush");
  assert.throws(() => g.grab({ part: "b", grip: "radius", index: 1 }, [0, 0]), /H011/);
  assert.throws(() => g.grab({ part: "b", grip: "radius", index: 5 }, [0, 0]), /no Grip/);
});
