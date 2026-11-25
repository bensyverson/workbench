// 3YNVB3 item 6: topLevelFunctions lists a function declaration with its text, which is String(fn).
import { test } from "node:test";
import assert from "node:assert/strict";
import { topLevelBindings, topLevelFunctions, functionAsArrow } from "../toplevel.js";

const DECLS = {
  plain: "function f(a, b) { return a + b; }\nexport default f;",
  exported: "export function f(a, b) {\n  const c = a + b; // sum\n  return c;\n}\nexport default f;",
  braces: "function f(a = {}, b = (1)) { return `}${a}` + \"}\"; }\nexport default f;",
  twoOnALine: "function g() {} function f(a) { return a; }\nexport default f;",
};

test("a function declaration's text is String(fn), so a host can vouch for it", async () => {
  const wrong = [];
  for (const [label, code] of Object.entries(DECLS)) {
    const mod = await import(`data:text/javascript,${encodeURIComponent(code)}`);
    const b = topLevelFunctions(code).find((x) => x.name === "f");
    if (b?.init !== String(mod.default)) wrong.push(`${label}: ${JSON.stringify(b)}`);
  }
  assert.deepEqual(wrong, []);
});

test("a function expression is no declaration; topLevelBindings does not list functions", () => {
  const code = "const a = function () {}; let b = 1; function d() {} const c = (x) => x;\n";
  assert.deepEqual(topLevelFunctions(code).map((f) => f.name), ["d"]);
  assert.deepEqual(topLevelBindings(code).map((b) => `${b.keyword} ${b.name}`), ["const a", "let b", "const c"]);
});

test("functionAsArrow writes the arrow twin, and refuses what is no plain declaration", () => {
  assert.deepEqual(functionAsArrow("function f(a, b) { return a + b; }"), { arrow: "(a, b) => { return a + b; }" });
  assert.deepEqual(functionAsArrow("function f(a = g(1), { b }) {\n  return a;\n}"), { arrow: "(a = g(1), { b }) => {\n  return a;\n}" });
  assert.match(/** @type {{ error: string }} */ (functionAsArrow("async function f(a) {}")).error, /async/);
  assert.match(/** @type {{ error: string }} */ (functionAsArrow("function* f(a) {}")).error, /generator/);
  assert.match(/** @type {{ error: string }} */ (functionAsArrow("function (a) {}")).error, /name/);
  assert.match(/** @type {{ error: string }} */ (functionAsArrow("(a) => a")).error, /declaration/);
});
