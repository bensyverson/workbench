// Which strings a name() takes (H5, 2026-11-25: a child construct's opening name() took "9jet", while a slot's
// name() refused it). The root's opening name is the Program's own name, a label; every other name() is an identifier.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, data } from "../index.js";

const tiny = defineDialect({
  name: "tiny", numberType: "f64", text: () => "", spaces: { s: { pure: true } }, targets: { js: { accepts: "*", compare: exact() } }, slots: {},
});
const g = defineGrammar(tiny, { root: "p", constructs: {
  p: { opens: [name()], slots: { tag: { kind: "decl", args: [name("tag")] } } },
  emitter: { parent: "p", opens: [name(), data("number")] },
} });

/** The codes `.check()` reports for a Program built by `make`. @param {(b: any) => any} make */
const codes = (make) => make(g).check().map((/** @type {any} */ d) => d.code);

test("a child construct's opening name() refuses what a slot's name() refuses, with the same B004", () => {
  for (const bad of ["9jet", "a-b", "has space"]) {
    const child = make((b) => b("x").emitter(bad, 1));
    const slot = make((b) => b("x").tag(bad));
    assert.deepEqual(child.map((/** @type {any} */ d) => d.code), ["B004"], `emitter("${bad}")`);
    assert.deepEqual(slot.map((/** @type {any} */ d) => d.code), ["B004"], `tag("${bad}")`);
    assert.equal(child[0].message, slot[0].message);
  }
});

test("identifiers still pass everywhere, and the root's opening name stays a label", () => {
  for (const ok of ["jet", "_x", "h$t", "Jet9"]) {
    assert.deepEqual(codes((b) => b("x").emitter(ok, 1)), [], `emitter("${ok}")`);
    assert.deepEqual(codes((b) => b("x").tag(ok)), [], `tag("${ok}")`);
  }
  assert.deepEqual(codes((b) => b("domain-warp").emitter("jet", 1)), []);
  assert.deepEqual(codes((b) => b("")), ["B004"]);
});

/** @param {(b: any) => any} f */
function make(f) { return f(g).check(); }
