// buildTimeShadows reads the parameters of every method, whatever its key is written as (issue kRYm3Y): a computed,
// string or numeric key, or a word such as `of` or `new`. Before, such a method recorded no parameters, so a
// Runtime Lambda inside it that read the parameter silently got the top-level binding (fail open).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeShadows } from "../toplevel.js";

const methods = {
  "computed key": "const K = 1;\nconst o = { [\"build\"](K) { return b().f((p) => K); } };\nexport default () => o.build(2);",
  "string key": "const K = 1;\nconst o = { \"build\"(K) { return b().f((p) => K); } };\nexport default () => o.build(2);",
  "numeric key": "const K = 1;\nconst o = { 0(K) { return b().f((p) => K); } };\nexport default () => o[0](2);",
  "class computed key": "const K = 1;\nclass B { [\"m\"](K) { return b().f((p) => K); } }\nexport default () => new B().m(2);",
  "class string key": "const K = 1;\nclass B { 'm'(K) { return b().f((p) => K); } }\nexport default () => new B().m(2);",
  "static computed key": "const K = 1;\nclass B { static [\"m\"](K) { return b().f((p) => K); } }\nexport default () => B.m(2);",
  "async string key": "const K = 1;\nconst o = { async 'm'(K) { return b().f((p) => K); } };\nexport default () => o.m(2);",
  "method named of": "const K = 1;\nconst o = { of(K) { return b().f((p) => K); } };\nexport default () => o.of(2);",
  "method named new": "const K = 1;\nconst o = { new(K) { return b().f((p) => K); } };\nexport default () => o.new(2);",
  "method named if": "const K = 1;\nconst o = { if(K) { return b().f((p) => K); } };\nexport default () => o.if(2);",
  "class method named if": "const K = 1;\nclass B { if(K) { return b().f((p) => K); } }\nexport default () => new B().if(2);",
  "class method named for, after another method": "const K = 1;\nclass B { a() {} for(K) { return b().f((p) => K); } }\nexport default () => new B().for(2);",
  "second object member named while": "const K = 1;\nconst o = { a: 1, while(K) { return b().f((p) => K); } };\nexport default () => o.while(2);",
};
for (const [name, code] of Object.entries(methods)) {
  test(`fail open: a ${name} method's parameter read by a lambda inside it is a shadow`, () => assert.deepEqual(buildTimeShadows(code), ["K"]));
}

test("a statement head named like a method is still no method", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nexport default () => { if (K) { return b().f((p) => K); } return b(); };"), []);
  assert.deepEqual(buildTimeShadows("const K = 1;\nfunction g(xs) { while (K) { xs.map((x) => x); } }\nexport default () => b().f((p) => K);"), []);
});

test("a call or an index that is no method adds no parameters", () => {
  assert.deepEqual(buildTimeShadows("const K = 1;\nconst o = { a: [(x) => x] };\nexport default () => b().f((p) => o.a[0](K));"), []);
});
