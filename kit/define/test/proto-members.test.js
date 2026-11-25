// Declared tables are looked up by own key: an Object.prototype name is never a member, a global, a vector, a
// conversion or a rejected entry unless the Dialect declares it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineDialect, defineGrammar, exact, name, lambda } from "../index.js";

const d = defineDialect({
  name: "chk", numberType: "f64", text: () => "",
  spaces: { s: { instance: "P" } },
  objects: {
    P: { label: "the particle (p)", members: { n: { value: "f64", write: true } }, rejected: { collide: { message: "particles never meet" } } },
    M: { label: "Math", members: { abs: { fn: { params: ["f64"], returns: "f64" } } }, rejected: { constructor: { message: "no constructors here" }, toString: { message: "no strings from Math" } } },
  },
  globals: { Math: "M" },
  targets: { js: { accepts: "*", compare: exact() } },
  slots: { k: { params: ["P"], returns: "void", space: "s", may: ["write P"] } },
});
const g = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
const run = (/** @type {string} */ src) => g.lower(g("x").k(src).build({})).diagnostics.map((x) => `${x.code} ${x.message}`);

test("a rejected entry named like an Object.prototype member is reachable", () => {
  assert.deepEqual(run("(p) => { p.n = Math.constructor; }"), ["L002 Math does not offer 'constructor': no constructors here"]);
  assert.deepEqual(run("(p) => { p.n = Math.toString(); }"), ["L002 Math does not offer 'toString': no strings from Math"]);
});

test("a prototype name is not a member of a declared object", () => {
  for (const m of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
    const out = run(`(p) => { p.n = p.${m}; }`);
    assert.equal(out.length, 1, m);
    assert.match(out[0], /^L002 the particle \(p\) has no member/, m);
  }
  assert.match(run("(p) => { p.n = Math.valueOf(); }")[0], /^L002 Math has no member 'valueOf'/);
  assert.deepEqual(run("(p) => { p.n = Math.abs(1); }"), []);
});

test("a prototype name is not a global, a vector or a conversion", () => {
  for (const m of ["constructor", "toString", "valueOf", "hasOwnProperty"]) {
    for (const src of [`(p) => { p.n = ${m}; }`, `(p) => { p.n = ${m}(1); }`, `(p) => { ${m} = 1; }`]) {
      // The builder refuses a name the lambda cannot see (B008) before lowering runs.
      assert.throws(() => run(src), (/** @type {any} */ e) => e.diagnostics.every((/** @type {{ code: string }} */ x) => x.code === "B008"), src);
    }
  }
});

test("a prototype name is not a rejected construct method", () => {
  const rg = defineGrammar(d, { root: "p", constructs: { p: { opens: [name()], rejected: { zap: { message: "no zapping" } }, slots: { k: { kind: "decl", args: [lambda("k")] } } } } });
  assert.throws(() => /** @type {any} */ (rg("x")).isPrototypeOf(1), (/** @type {any} */ e) => e.diagnostics[0].code === "B001");
  assert.throws(() => /** @type {any} */ (rg("x")).propertyIsEnumerable("k"), (/** @type {any} */ e) => e.diagnostics[0].code === "B001");
  assert.throws(() => /** @type {any} */ (rg("x")).zap().k("(p) => {}").build({}), /no zapping/);
});
