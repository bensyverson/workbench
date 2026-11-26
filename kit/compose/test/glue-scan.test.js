// scanGlue reports S301 for any test or comparison of a handle (a member chain ending .out.X, .in.X or .frame.X),
// at its line: an object is always truthy and never equal to undefined or null, so the glue's branch would silently
// take one side. Arithmetic and ordering are caught at run time by the handle's toPrimitive trap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanGlue } from "../index.js";

const HEAD = 'import { compose } from "kit/compose";\nimport { maze } from "maze";\n';
/** @param {string} body @returns {Array<[string, number]>} */
const s301 = (body) => scanGlue(`${HEAD}${body}`, ["maze"]).diagnostics.filter((d) => d.code === "S301").map((d) => [d.code, /** @type {any} */ (d).line]);

test("S301 for a param handle tested, as for a port's", () => {
  assert.deepEqual(s301("if (level.param.depth) { c.show(level); }"), [["S301", 3]]);
  assert.deepEqual(s301("const x = level.param.depth === undefined;"), [["S301", 3]]);
});

test("S301 for each form of a handle tested or compared, at its line", () => {
  const forms = [
    "if (level.out.picked) { c.show(level); }",
    "const x = level.in.burst ? 1 : 2;",
    "const x = !level.out.picked;",
    "const x = level.out.picked && 1;",
    "const x = level.out.picked || 1;",
    "const x = level.out.picked ?? 1;",
    "const x = level.out.picked !== undefined;",
    "const x = undefined === level.out.picked;",
    "const x = level.out.picked === null;",
    "const x = level.out.picked != null;",
    "const x = level.out.picked == null;",
    "const x = level.frame.cell === level.frame.px;",
    "while (level.out.picked) { break; }",
    "for (; level.out.picked; ) { break; }",
    "do { break; } while (level.out.picked);",
    "const x = typeof level.out.picked;",
    "const x = level.out?.picked ? 1 : 2;",
    'const x = level.out["picked"] ? 1 : 2;',
    "const x = !!level.out.picked;",
    "const x = parts.level.out.picked ? 1 : 2;",
  ];
  for (const f of forms) assert.deepEqual(s301(`\n${f}\n`), [["S301", 4]], f);
});

test("S301 for a handle in a switch, an in or instanceof, a sequence, or inside a compared logical or ternary", () => {
  const forms = [
    "switch (level.out.picked) { case 1: break; }",
    "switch (x) { case level.out.picked: break; }",
    "const y = level.out.picked in obj;",
    "const y = key in level.out.picked;",
    "const y = level.out.picked instanceof Object;",
    "const y = (0, level.out.picked) ? 1 : 2;",
    "if ((a, level.out.picked)) {}",
    "const y = !(a, level.out.picked);",
    "const y = (flag && level.out.picked) === 1;",
    "const y = 1 === (flag || level.out.picked);",
    "const y = (flag ? level.out.picked : other) === 1;",
    "const y = ((0, level.out.picked) && flag) === 1;",
    "if ((flag ? level.out.picked : other)) {}",
  ];
  for (const f of forms) assert.deepEqual(s301(`\n${f}\n`), [["S301", 4]], f);
  const fine = [
    "const h = (0, level.out.picked);",
    "const y = (flag && 1) === 1;",
    "switch (x) { case 1: break; }",
    "const y = key in obj;",
    "c.wire((flag ? level.out.picked : other), fx.in.burst);",
  ];
  for (const f of fine) assert.deepEqual(s301(`\n${f}\n`), [], f);
});

test("a logical's right operand is the result, not a tested value: only a logical in a test position tests it", () => {
  // `flag && level.out.picked` selects a handle at build time, which is correct glue (the handle is the value of the
  // expression, never tested); its left operand is always tested.
  const fine = [
    "const h = flag && level.out.picked;",
    "const h = override || level.out.picked;",
    "const h = override ?? level.out.picked;",
    "const x = 1 && level.out.picked;",
    "const h = a && (b || level.out.picked);",
    "const h = flag ? level.out.picked : level.out.other;",
    "const h = flag ? (a && level.out.picked) : null;",
  ];
  for (const f of fine) assert.deepEqual(s301(`\n${f}\n`), [], f);
  const flagged = [
    "if (1 && level.out.picked) {}",
    "if (a && (b || level.out.picked)) {}",
    "const x = (a || level.out.picked) ? 1 : 2;",
    "const x = !(a && level.out.picked);",
    "while (a ?? level.out.picked) { break; }",
    "if ((level.out.picked && a) && b) {}",
    "const x = typeof (a && level.out.picked);",
  ];
  for (const f of flagged) assert.deepEqual(s301(`\n${f}\n`), [["S301", 4]], f);
});

test("S301 is reported once, at the handle chain's own line", () => {
  assert.deepEqual(s301("\nif (\n  a &&\n  level.out.picked\n) {}\n"), [["S301", 6]]);
  assert.deepEqual(s301("\nconst x = a\n  ? 1\n  : 2;\nconst y = (\n  level.out.picked\n) ? 1 : 2;\n"), [["S301", 8]]);
  assert.deepEqual(s301("\nconst x = level.frame.cell ===\n  level.frame.px;\n"), [["S301", 4]]);
});

test("S301 carries file, line, message and fix", () => {
  const d = scanGlue(`${HEAD}\nif (level.out.picked) {}\n`, ["maze"], "glue.js").diagnostics[0];
  assert.deepEqual([d.code, d.severity, d.file, /** @type {any} */ (d).line], ["S301", "error", "glue.js", 4]);
  assert.match(d.message, /level\.out\.picked is tested or compared at build time; a handle is not a value/);
  assert.match(d.fix, /\.wire or \.frame/);
});

test("ordinary glue passes: handles as arguments, ordinary tests, other members named in/out", () => {
  const ok = [
    "const c = compose('x').part(level).wire(level.out.picked, fx.in.burst).frame(level.frame.cell, fx.frame.px, 'fit');",
    "const w = true; if (w) { c.show(level); }",
    "const x = w ? level : fx;",
    "const y = a === null || b !== undefined;",
    "const z = level.out;",
    "const n = fx.in.burst.toString().length > 3;",
    "const t = [level.out.picked, fx.in.burst].length > 1;",
    "const u = other.outer.picked ? 1 : 2;",
    "const v = `${level.out}` ? 1 : 2;",
  ];
  for (const f of ok) assert.deepEqual(s301(`\n${f}\n`), [], f);
  assert.deepEqual(scanGlue(`${HEAD}\nconst c = compose('x').wire(level.out.picked, fx.in.burst);\n`, ["maze"]).diagnostics, []);
});

test("S301 and K007 both report; a glue that does not parse reports only K007", () => {
  const both = scanGlue('import fs from "node:fs";\nif (a.out.b) {}\n', ["maze"]).diagnostics.map((d) => [d.code, /** @type {any} */ (d).line]);
  assert.deepEqual(both, [["K007", 1], ["S301", 2]]);
  assert.deepEqual(scanGlue("if (a.out.b) {", ["maze"]).diagnostics.map((d) => d.code), ["K007"]);
});
