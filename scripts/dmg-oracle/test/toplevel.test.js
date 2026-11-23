import { test } from "node:test";
import assert from "node:assert/strict";
import { inventory } from "../inventory.js";
import { topLevelNames, topLevelRefs } from "../toplevel.js";

test("topLevelNames lists a program's top-level consts, lets, vars and functions", () => {
  const code = `// const nope = 1;\nconst A = 1;\nlet b = 2, c = 3;\nvar d;\nfunction f() { const inner = 1; }\nasync function g() {}\n  const indented = 1;\nGame("x");`;
  assert.deepEqual(topLevelNames(code), ["A", "b", "c", "d", "f", "g"]);
});

test("topLevelRefs finds identifiers that resolve to a top-level name", () => {
  assert.deepEqual(topLevelRefs("(self, w) => { self.x = DIRS[0] + helper(1); }", ["DIRS", "helper", "other"]), ["DIRS", "helper"]);
});

test("topLevelRefs ignores property names, object keys, strings, comments and the lambda's own bindings", () => {
  const names = ["cell", "n", "k", "i", "s"];
  assert.deepEqual(topLevelRefs("(self) => self.cell", names), [], "member access");
  assert.deepEqual(topLevelRefs("(w) => w.emit('e', { cell: 1 })", names), [], "object key");
  assert.deepEqual(topLevelRefs("(w) => w.emit('n k i', \"s\")", names), [], "string contents");
  assert.deepEqual(topLevelRefs("(w) => { // uses cell\n return 1; }", names), [], "comment");
  assert.deepEqual(topLevelRefs("(w) => { const n = 1; let [k, i] = [1, 2]; return n + k + i; }", names), [], "local declarations");
  assert.deepEqual(topLevelRefs("(n) => n + 1", names), [], "parameter");
  assert.deepEqual(topLevelRefs("(w, s) => s", names), [], "second parameter");
  assert.deepEqual(topLevelRefs("k => k", names), [], "bare arrow parameter");
  assert.deepEqual(topLevelRefs("(w) => { for (let i = 0; i < 3; i++) w.n = i; }", names), [], "loop variable");
  assert.deepEqual(topLevelRefs("(w) => { for (const s of w.all()) s.n = 1; }", names), [], "for-of variable");
});

test("the inventory flags lambdas that use top-level bindings, and nothing else", () => {
  const inv = inventory();
  assert.equal(inv.length, 126);
  const flagged = inv.filter((e) => e.topLevelRefs.length > 0).map((e) => `${e.preset} ${e.id}`);
  for (const k of ["21 snake.onFrame#0", "21 bot", "22 Ball.onFrame#0", "23 flappy.onFrame#0", "25 lights-out.on(press)#0", "26 life.onFrame#0", "14 memory.onFrame#0"]) assert.ok(flagged.includes(k), `${k} flagged in ${flagged.join(", ")}`);
  assert.ok(!flagged.includes("04 Mole.onFrame#0"), "preset 04 has no helpers");
  const snake = inv.find((e) => e.preset === "21" && e.id === "snake.onFrame#0");
  assert.deepEqual(snake?.topLevelRefs, ["DIRS", "BACK", "placeFood"]);
});
