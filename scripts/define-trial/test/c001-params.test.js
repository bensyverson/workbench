// Review of c2845ca: C001 must refuse a default export that does not take exactly one parameter. A second
// parameter with a default, or a rest parameter after `$`, leaves `length` at 1, and checkExport accepts it.
// @ts-nocheck
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExport } from "../checker/examples.js";
import { session } from "../checker/session.js";

const FILE = "examples/01.js";
const exportOf = (text) => { session.reset("file:///tmp/x/", { [FILE]: `${text}\n` }); };

test("C001 refuses ($, extra = 0) => …: two parameters, though length is 1", () => {
  exportOf("export default ($, extra = 0) => 1;");
  const fn = ($, extra = 0) => [$, extra];
  assert.equal(fn.length, 1);
  assert.equal(checkExport(FILE, fn), null, "accepted a function of two parameters");
});

test("C001 refuses ($, ...rest) => …: a rest parameter, which the rules say does not count", () => {
  exportOf("export default ($, ...rest) => 1;");
  const fn = ($, ...rest) => [$, rest];
  assert.equal(fn.length, 1);
  assert.equal(checkExport(FILE, fn), null, "accepted a function with a rest parameter");
});

test("C001 refuses a class whose method has one defaulted parameter (paramList reads the method's list)", () => {
  exportOf("export default class { m(a = 1) {} }");
  const C = class { m(a = 1) { return a; } };
  assert.equal(checkExport(FILE, C), null, "accepted a class as the Program function");
});

test("C001 still accepts one parameter, however it is written, including one with a default", () => {
  const cases = [
    ["export default ($) => 1;", ($) => $],
    ["export default $ => 1;", ($) => $],
    ["export default ($ = {}) => 1;", ($ = {}) => $],
    ["export default ({ topN } = {}) => 1;", ({ topN } = {}) => topN],
    ["export default function ($) { return 1; }", function ($) { return $; }],
    ["export default async ($) => 1;", async ($) => $],
  ];
  for (const [text, fn] of cases) {
    exportOf(text);
    assert.equal(checkExport(FILE, fn), fn, text);
  }
});
