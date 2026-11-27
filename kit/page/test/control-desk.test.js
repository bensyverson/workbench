// @ts-nocheck: the stubs stand in for the page's own closures.
// The Controls block of createPage, alone (controls.js): `createControls` takes the page's seams (its parts' UIs and
// compiled records, its write problem, its preview and its log) as functions, so a test drives it with stubs. The
// FM synth: a wired keyed knob (an operator's ratio) and a part-local param knob.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createControls } from "../controls.js";

/** The Controls block over stubs: one part `s`, a wired `ratio` (keyed, with to) and a part-local `gain`. */
function desk(o = {}) {
  const logged = [], previews = [], reports = [];
  const ui = {
    controls: {
      ratio: { kind: "number", keyed: true, input: "ratio", decl: { kind: "number", min: 0, max: 16, value: 1 } },
      gain: { kind: "number", local: true, decl: { kind: "number", min: 0, max: 2, value: 1, to: "param.gain" } },
    },
  };
  const c = createControls({
    composed: { parts: [{ name: "page", dialect: "page" }, { name: "s", dialect: "synth" }] },
    controls: { ratio: { kind: "number", keyed: true, records: "state", decl: ui.controls.ratio.decl } },
    uiOfPart: (part) => (part === "s" ? ui : null),
    compiledOf: () => ({ instances: { ratio: [{ key: "a", value: 2, to: "arg.s.a" }, { key: "b", value: 3, to: o.badB ? "arg.s.zz" : "arg.s.b" }] } }),
    writeProblem: (_part, to) => (to === "arg.s.zz" ? { code: "H011", message: "no call is at arg.s.zz" } : null),
    preview: (part, to, value, what, how = "log") => { previews.push({ part, to, value, what, how }); return true; },
    logInput: (e, event) => logged.push({ e, event }),
    report: (d) => reports.push(d),
    now: () => "0",
  });
  return { c, logged, previews, reports };
}

test("createControls lists the wired Controls, then the part-local ones, with a keyed one's instances", () => {
  const { c } = desk();
  const list = c.list();
  assert.deepEqual(list.map((x) => [x.name, x.part, x.local ?? false]), [["ratio", "s", false], ["s.gain", "s", true]]);
  assert.deepEqual(list[0].instances.map((i) => [i.key, i.to, i.disabled]), [["a", "arg.s.a", null], ["b", "arg.s.b", null]]);
  assert.deepEqual([list[1].to, list[1].disabled], ["param.gain", null]);
});

test("createControls: a wired Control logs a page input and its release is checked by a build, not logged", () => {
  const { c, logged, previews } = desk();
  assert.equal(c.control("ratio", { key: "b", value: 5 }, { phase: "preview" }), null);
  assert.deepEqual(c.control("ratio", { key: "b", value: 6 }, { timeStamp: 12 }), { part: "s", to: "arg.s.b", value: 6 });
  assert.deepEqual(logged.map((l) => [l.e.kind, l.e.part, l.e.name, l.e.value]), [["control", "page", "ratio", { key: "b", value: 5 }], ["control", "page", "ratio", { key: "b", value: 6 }]]);
  assert.equal(logged[1].event.timeStamp, 12);
  assert.deepEqual(previews.map((p) => [p.to, p.value, p.how]), [["arg.s.b", 6, "check"]], "checked, not logged");
});

test("createControls: a part-local Control's previews wait for flush, the latest of each target, and its release previews at once", () => {
  const { c, logged, previews } = desk();
  c.control("s.gain", { value: 1.2 }, { phase: "preview" });
  c.control("s.gain", { value: 1.4 }, { phase: "preview" });
  assert.equal(previews.length, 0);
  c.flush();
  assert.deepEqual(previews.map((p) => [p.to, p.value, p.how]), [["param.gain", 1.4, "log"]]);
  assert.deepEqual(c.control("s.gain", { value: 1.5 }), { part: "s", to: "param.gain", value: 1.5 });
  assert.deepEqual(previews.at(-1).how, "log", "the release's value is in force at once, as its previews were, before its write-back");
  assert.equal(logged.length, 0, "a part-local Control is never a page input");
});

test("createControls: a target that cannot be written is H011 once, listed disabled; its instance still plays and commits nothing", () => {
  const { c, logged, reports } = desk({ badB: true });
  const b = c.list()[0].instances.find((i) => i.key === "b");
  assert.equal(b.disabled.code, "H011");
  c.list();
  assert.equal(reports.filter((r) => r.code === "H011").length, 1, "reported once");
  assert.equal(c.control("ratio", { key: "b", value: 2 }), null);
  assert.equal(logged.length, 1);
  assert.throws(() => c.control("nope", {}), /nope/);
  assert.throws(() => c.control("ratio", { key: "zz", value: 1 }), /zz/);
});
