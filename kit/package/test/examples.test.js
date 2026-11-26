// @ts-nocheck: Programs here name the data Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExamples } from "../index.js";
import { program } from "../../dialects/data/grammar.js";

const SALES = { csv: "s.csv", columns: { region: "str", units: "f64" } };
const good = () => ($) => program("q").source("sales", SALES).table("t", "sales").limit(3);
const badParam = () => ($) => program("q").source("sales", SALES).param("n", { value: 99, min: 1, max: 5 }).table("t", "sales").limit($.n);

/** A LoadedPackage stand-in: only what checkExamples reads. */
const loaded = (examples, refusals = []) => ({ name: "q", grammar: program, examples, refusals, diagnostics: [] });
const importer = (modules) => async (p) => { if (!(p in modules)) throw new Error(`cannot import ${p}`); return modules[p]; };
const check = (l, modules, o = {}) => checkExamples(l, { importModule: importer(modules), ...o });
const codes = (ds) => ds.map((d) => d.code);

test("examples that build clean give no diagnostics", async () => {
  assert.deepEqual(await check(loaded(["examples/01.js"]), { "examples/01.js": { default: good() } }), []);
});

test("an example whose Program is refused is K012, naming the example and the first diagnostic", async () => {
  const ds = await check(loaded(["examples/01.js", "examples/02.js"]), { "examples/01.js": { default: badParam() }, "examples/02.js": { default: good() } });
  assert.deepEqual(codes(ds), ["K012"]);
  assert.equal(ds[0].file, "examples/01.js");
  assert.match(ds[0].message, /examples\/01\.js/);
  assert.match(ds[0].message, /B004/);
  assert.ok(ds[0].fix);
});

test("an example whose default export is not a function of the params is K012", async () => {
  for (const exported of [undefined, 5, good()()]) {
    const ds = await check(loaded(["examples/01.js"]), { "examples/01.js": { default: exported } });
    assert.deepEqual(codes(ds), ["K012"], String(exported));
  }
});

test("an example that throws when built is K012, with the error's message", async () => {
  const ds = await check(loaded(["examples/01.js"]), { "examples/01.js": { default: () => { throw new Error("kaboom"); } } });
  assert.deepEqual(codes(ds), ["K012"]);
  assert.match(ds[0].message, /kaboom/);
});

test("an example that fails to import is K011", async () => {
  const ds = await check(loaded(["examples/01.js"]), {});
  assert.deepEqual(codes(ds), ["K011"]);
  assert.equal(ds[0].file, "examples/01.js");
  assert.match(ds[0].message, /cannot import/);
});

test("a refusal that is refused with its code passes", async () => {
  assert.deepEqual(await check(loaded([], [{ module: "examples/r01.js", code: "B004" }]), { "examples/r01.js": { default: badParam() } }), []);
});

test("a refusal that builds clean is K013, naming the module and the code it should have given", async () => {
  const ds = await check(loaded([], [{ module: "examples/r01.js", code: "B004" }]), { "examples/r01.js": { default: good() } });
  assert.deepEqual(codes(ds), ["K013"]);
  assert.equal(ds[0].file, "examples/r01.js");
  assert.match(ds[0].message, /B004/);
});

test("a refusal refused with another code is K014, naming both codes", async () => {
  const ds = await check(loaded([], [{ module: "examples/r01.js", code: "L004" }]), { "examples/r01.js": { default: badParam() } });
  assert.deepEqual(codes(ds), ["K014"]);
  assert.match(ds[0].message, /L004/);
  assert.match(ds[0].message, /B004/);
});

test("a refusal whose default export is not a function, or that fails to import, is not accepted silently", async () => {
  assert.deepEqual(codes(await check(loaded([], [{ module: "r.js", code: "B004" }]), { "r.js": { default: 3 } })), ["K012"]);
  assert.deepEqual(codes(await check(loaded([], [{ module: "r.js", code: "B004" }]), {})), ["K011"]);
});

test("the Grammar's lower() counts: a Program clean to build but refused in lowering is K012 as an example and matched by code as a refusal", async () => {
  const lowerRefused = ($) => program("q").source("sales", SALES).table("t", "sales").filter((row) => row.nope > 1);
  const ds = await check(loaded(["e.js"]), { "e.js": { default: lowerRefused } });
  assert.deepEqual(codes(ds), ["K012"]);
  assert.match(ds[0].message, /L002/);
  assert.deepEqual(await check(loaded([], [{ module: "e.js", code: "L002" }]), { "e.js": { default: lowerRefused } }), []);
  assert.deepEqual(codes(await check(loaded([], [{ module: "e.js", code: "L004" }]), { "e.js": { default: lowerRefused } })), ["K014"]);
});

test("buildOptions is called with the path and the imported module, and its result goes to run()", async () => {
  /** @type {any[]} */
  const seen = [];
  const mod = { default: good(), marker: 1 };
  await check(loaded(["examples/01.js"], [{ module: "examples/r01.js", code: "B004" }]), { "examples/01.js": mod, "examples/r01.js": { default: badParam() } }, { buildOptions: (p, m) => { seen.push([p, m === mod]); return {}; } });
  assert.deepEqual(seen, [["examples/01.js", true], ["examples/r01.js", false]]);
});

test("a package that did not load (no grammar) has nothing to check", async () => {
  assert.deepEqual(await checkExamples({ grammar: null, examples: ["a.js"], refusals: [], diagnostics: [] }, { importModule: async () => { throw new Error("no"); } }), []);
});
