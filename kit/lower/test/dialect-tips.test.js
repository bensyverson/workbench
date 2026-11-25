// Tips that depend on a domain come from the Environment's own `tips`; a Dialect without them gets neutral ones
// (H5, 2026-11-25: particles authors were told "Baked values are ROM constants … declare an .attr" and about
// w.param("n"), both DMG's). DMG's own wording is unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lowerLambda, lowerProgram } from "../index.js";
import { lower, environment } from "./fixture.js";

/** @import { Environment } from "../environment.js" */

/** @type {Environment} */
const env = {
  name: "neutral (test)",
  objects: {
    Particle: { label: "a particle (p)", members: { age: { kind: "value", t: "f64" }, size: { kind: "value", t: "f64", store: { type: "value" } } } },
    Params: { label: "the params ($)", members: { n: { kind: "value", t: "f64" } } },
  },
  list: {}, queries: [],
  globals: { $: { obj: "Params" } },
  slot: () => ({ params: [{ obj: "Particle" }], returns: "void", space: "particle", forbid: [], may: ["read Particle", "write Particle"] }),
};

/** The diagnostic of `code` lowering `src` against `e` gives. @param {Environment} e @param {string} code @param {string} src */
const one = (e, code, src) => {
  const d = lowerLambda(e, src, { id: "update#0", kind: "update", on: "jet" }).diagnostics.find((x) => x.code === code);
  assert.ok(d, `${code} for ${src}`);
  return d;
};

/** The L013 for a store to a top-level constant of the program. @param {Environment} e @param {string} src @param {string} on */
const topLevelStore = (e, src, on, kind = "k") => {
  const r = lowerProgram(e, [{ src, slot: { id: `${on}.${kind}#0`, kind, on } }], [{ name: "G", kind: "const", src: "3" }]);
  const d = r.results[0].diagnostics.find((x) => x.code === "L013");
  assert.ok(d, "L013 for a store to a top-level constant");
  return d;
};

const DMG_WORDS = /ROM|\.attr|\bframe\b|w\.param/;

test("without tips: L013's tip says nothing of ROM, frame or .attr", () => {
  const d = one(env, "L013", "(p) => { p.age = 1; }");
  assert.doesNotMatch(d.tip ?? "", DMG_WORDS);
  assert.match(d.tip ?? "", /let|writable/);
});

test("without tips: L007's tips name no w.param, and a member bound says how a Dialect declares a size", () => {
  const member = one(env, "L007", "(p) => { for (let k = 0; k < $.n; k++) { p.size += 1; } }");
  assert.doesNotMatch(member.tip ?? "", DMG_WORDS);
  assert.match(member.tip ?? "", /size: true/);
  assert.match(member.tip ?? "", /Dialect's author/, "only the Dialect's author can declare a size");
  assert.doesNotMatch(member.tip ?? "", /declare it a size, \{/, "a Program author is not told to declare a size");
  const loose = one(env, "L007", "(p) => { for (let k = 0; k < 4; k += 2) { p.size += 1; } }");
  assert.doesNotMatch(loose.tip ?? "", DMG_WORDS);
  const shape = one(env, "L007", "(p) => { for (let k = 0; k > 4; k++) { p.size += 1; } }");
  assert.doesNotMatch(shape.tip ?? "", DMG_WORDS);
});

test("an Environment's tips replace the neutral ones", () => {
  const own = { ...env, tips: { readOnly: "R", loopBound: "B", size: "S", topLevel: "T" } };
  assert.equal(one(own, "L013", "(p) => { p.age = 1; }").tip, "R");
  assert.equal(topLevelStore(own, "(p) => { G = 0; }", "jet").tip, "T");
  assert.equal(one(own, "L007", "(p) => { for (let k = 0; k < $.n; k++) { p.size += 1; } }").tip, "S");
  assert.equal(one(own, "L007", "(p) => { for (let k = 0; k > 4; k++) { p.size += 1; } }").tip, "B");
});

test("without tips: a store to a top-level constant says nothing of attributes", () => {
  const d = topLevelStore(env, "(p) => { G = 0; }", "jet");
  assert.doesNotMatch(d.tip ?? "", /attribute|\.attr|ROM/);
  assert.match(d.tip ?? "", /let/);
});

test("DMG keeps its own wording, word for word", () => {
  assert.equal(topLevelStore(environment, "(self) => { G = 0; }", "Mole", "onFrame").tip, "A baked constant cannot change at run time; keep changing state in an attribute.");
  const ro = lower("(self) => { self.stay = 3; }").diagnostics.find((d) => d.code === "L013");
  assert.equal(ro?.tip, "Baked values are ROM constants and built-ins like frame belong to the runtime; declare an .attr to change it.");
  const size = lower("(self) => { for (let i = 0; i < self.ttl; i++) self.rise++; }").diagnostics.find((d) => d.code === "L007");
  assert.equal(size?.tip, "Bound the loop by a constant, a list's length, or a member its Dialect declares a size (such as a param with a small max).");
  const shape = lower("(self) => { for (let i = 0; i > 4; i++) self.rise++; }").diagnostics.find((d) => d.code === "L007");
  assert.equal(shape?.tip, "Count with for (let i = 0; i < n; i++), starting from an integer or a param, where n is a constant, a param such as w.param(\"n\"), or a list's length, and leave i alone in the body.");
});
