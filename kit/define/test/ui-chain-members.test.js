// @ts-nocheck: the UI's lambdas are source text, never called.
// What a UI lambda may read of a list, a string and a vector is exactly what ui.lower accepts (leaf ABzhFy): a list's length
// and items by index, a vector's components by name. A string has no length and a vector no index, as in lowering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, defineUI, run, exact, vector, list, struct, name, lambda, DefinitionError } from "../index.js";

const make = (numberType) => {
  const types = numberType === "f32" ? { vec2: vector(2, "f32") } : { vec2: vector(2, "f64") };
  const d = defineDialect({
    name: "m" + numberType, numberType, types,
    spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } },
    slots: { v: { params: [], returns: numberType, space: "s" } }, text: () => "",
    state: { label: "str", center: "vec2", bodies: list(struct({ mass: numberType }), 5), names: list("str", 5) },
  });
  const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { v: { kind: "decl", args: [lambda("v")], once: true } } } } });
  return g;
};
const g64 = make("f64");
const codes = (g, key, fn, extra = {}) => {
  try { defineUI(g, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: key, label: "x", ...extra, ...(key === "check" ? { expect: fn } : { value: fn }) }] } } }); return []; } catch (e) {
    assert.ok(e instanceof DefinitionError, String(e));
    return e.diagnostics.map((d) => d.code);
  }
};

test("a string's length is refused by defineUI, as lowering refuses it", () => {
  assert.deepEqual(codes(g64, "stat", (s) => s.label.length), ["U007"]);
  assert.deepEqual(codes(g64, "stat", (s) => s.label), []);
});

test("a vector's index is refused by defineUI, as lowering refuses it; its components pass", () => {
  assert.deepEqual(codes(g64, "stat", (s) => s.center[1]), ["U007"]);
  assert.deepEqual(codes(g64, "stat", (s) => s.center.x + s.center.y), []);
});

test("a list's length and an index into it pass; a string row has no length either", () => {
  assert.deepEqual(codes(g64, "stat", (s) => s.bodies.length), []);
  const col = (fn) => { try { defineUI(g64, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "table", label: "x", rows: "names", columns: [{ label: "c", value: fn }] }] } } }); return []; } catch (e) { return e.diagnostics.map((d) => d.code); } };
  assert.deepEqual(col((row) => row.length), ["U007"]);
  assert.deepEqual(col((row) => row), []);
  assert.deepEqual(codes(g64, "stat", (s) => s.bodies[0].mass), []);
});

test("defineUI and ui.lower agree on what each member read is, in an f32 Dialect as an f64 one", () => {
  for (const nt of ["f64", "f32"]) {
    const g = make(nt);
    const { record, diagnostics } = run(() => g("o"));
    assert.deepEqual(diagnostics, []);
    const ui = defineUI(g, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [
      { kind: "stat", label: "n", value: (s) => s.bodies.length, max: (s) => s.bodies.length },
      { kind: "stat", label: "c", value: (s) => s.center.x },
    ] } } });
    const r = ui.lower(record);
    assert.deepEqual(r.diagnostics.map((d) => [d.id, d.code, d.message]), [], nt);
  }
});

test("everything defineUI passes of a chain, ui.lower accepts (a sweep of member reads)", () => {
  const reads = {
    "s.bodies.length": true, "s.bodies[0].mass": "L008", "s.center.x": true, "s.center.y": true, "s.label.length": false, "s.center[0]": false,
    "s.names.length": true, "s.label": true,
  };
  const { record } = run(() => g64("o"));
  for (const [src, want] of Object.entries(reads)) {
    const fn = new Function("return (s) => " + src)();
    const refusedByDefine = codes(g64, "stat", fn).length > 0;
    if (want === false) { assert.equal(refusedByDefine, true, src); continue; }
    assert.equal(refusedByDefine, false, src);
    const ui = defineUI(g64, { tiles: { t: { title: "T", place: { splitBelow: "stage" }, body: [{ kind: "stat", label: "x", value: fn }] } } });
    const got = ui.lower(record).diagnostics.map((d) => d.code);
    assert.deepEqual(got, want === true ? [] : [want], src);
  }
});
