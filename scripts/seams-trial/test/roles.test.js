// The authors' legs: both package fixtures check clean, and each D code of the Dialect additions and each G code
// of the two authors' tasks has a failing copy made from a fixture by a small edit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { checkRole } from "../checker/index.js";
import { SEAM_DEFINE_CODES, TASK_CODES } from "../checker/codes.js";
import { handIn, sub, remove, FIXTURES } from "../fixture-copy.js";

/** Codes the cases below saw. @type {Set<string>} */
const seen = new Set();

/** @param {"maze" | "particles"} role @param {(dir: string) => void} edit */
async function check(role, edit) {
  const dir = await handIn(role, edit);
  try {
    const r = await checkRole(dir, role);
    for (const d of r.diagnostics) seen.add(d.code);
    return r;
  } finally { remove(dir); }
}
/** @param {{ diagnostics: Array<{ code: string }> }} r */
const codes = (r) => r.diagnostics.map((d) => d.code);
const MD = "maze.dialect.js", PD = "particles.dialect.js", PG = "particles.grammar.js";

for (const role of /** @type {const} */ (["maze", "particles"])) {
  test(`the ${role} fixture checks clean`, async () => {
    const r = await checkRole(join(FIXTURES, role), role);
    assert.deepEqual(r.diagnostics, []);
    assert.equal(r.ok, true);
  });
}

test("D024: a port with no note, and a key a port does not take", async () => {
  let r = await check("maze", (d) => sub(d, MD, ', note: "a coin the player picked up during this tick, at its cell; empty most ticks"', ""));
  assert.deepEqual(codes(r), ["D024"]);
  assert.match(r.diagnostics[0].message, /output 'picked' has no note/);
  assert.equal(r.diagnostics[0].file, MD);
  r = await check("maze", (d) => sub(d, MD, 'from: "score", note', 'form: "score", note'));
  assert.deepEqual(codes(r), ["D024", "D024"]);
  assert.match(r.diagnostics.map((x) => x.message).join("\n"), /no key 'form'. Did you mean 'from'\?/);
});

test("D025: a seam that names an undeclared frame, at the seam's line, with a did-you-mean", async () => {
  const r = await check("maze", (d) => sub(d, MD, "Event<{ at: point2@cell }>", "Event<{ at: point2@cel }>"));
  assert.deepEqual(codes(r), ["D025"]);
  assert.match(r.diagnostics[0].message, /names the frame 'cel'.*Did you mean 'cell'/);
  assert.equal(r.diagnostics[0].line, 66);
  assert.ok(r.diagnostics[0].fix);
});

test("D025: a seam that does not parse, and a point of other dims than its frame", async () => {
  assert.deepEqual(codes(await check("maze", (d) => sub(d, MD, 'seam: "f64", from: "score"', 'seam: "f32", from: "score"'))), ["D025"]);
  assert.deepEqual(codes(await check("maze", (d) => sub(d, MD, 'seam: "point2@cell", from: (s)', 'seam: "point3@cell", from: (s)'))), ["D025"]);
});

test("D026: a path that names nothing in the state, and an Event read by a lambda", async () => {
  let r = await check("maze", (d) => sub(d, MD, 'from: "picked"', 'from: "pickd"'));
  assert.deepEqual(codes(r), ["D026"]);
  assert.match(r.diagnostics[0].message, /Did you mean 'picked'/);
  r = await check("maze", (d) => sub(d, MD, 'from: "picked"', "from: (s) => s.picked"));
  assert.deepEqual(codes(r), ["D026"]);
});

test("D026: a lambda that breaks the UI value lambda rules", async () => {
  const r = await check("maze", (d) => sub(d, MD, "from: (s) => cell2(s.player.x, s.player.y)", "from: (s) => cell2(s.player.x, s.player.z)"));
  assert.deepEqual(codes(r), ["D026"]);
  assert.match(r.diagnostics[0].message, /no member 'z'/);
});

test("D027: a state type that does not pair with its seam, and a lambda's result, found when an example lowers", async () => {
  let r = await check("maze", (d) => sub(d, MD, 'seam: "f64", from: "score"', 'seam: "bool", from: "score"'));
  assert.deepEqual(codes(r), ["D027"]);
  assert.match(r.diagnostics[0].message, /bool pairs with "bool", not f64/);
  r = await check("maze", (d) => sub(d, MD, "from: (s) => cell2(s.player.x, s.player.y)", "from: (s) => s.player.x"));
  assert.deepEqual(codes(r), ["K012"]);
  assert.match(r.diagnostics[0].message, /D027 output 'player': its lambda gives f64/);
  seen.add("D027");
});

test("D027: a vector input when the Dialect has no vector type of its dims", async () => {
  const r = await check("particles", (d) => sub(d, PD, 'radius: { seam: "f64@px", default: 40', 'radius: { seam: "vec3", default: [0, 0, 0]'));
  assert.deepEqual(codes(r), ["D027"]);
  assert.match(r.diagnostics[0].message, /vector\(3, "f64"\) type, and the Dialect declares none/);
});

test("D028: a value input with neither default nor required, and an Event input with a default", async () => {
  let r = await check("particles", (d) => sub(d, PD, 'seam: "f64@px", default: 40,', 'seam: "f64@px",'));
  assert.deepEqual(codes(r), ["D028"]);
  r = await check("particles", (d) => sub(d, PD, 'seam: "Event<{ at: point2@px }>", note', 'seam: "Event<{ at: point2@px }>", default: [], note'));
  assert.deepEqual(codes(r), ["D028"]);
  r = await check("particles", (d) => sub(d, PD, "default: 40,", 'default: "wide",'));
  assert.deepEqual(codes(r), ["D028"]);
});

test("D029: value inputs with no inputs declaration, and an inputs object with no global", async () => {
  assert.deepEqual(codes(await check("particles", (d) => sub(d, PD, '  inputs: { object: "In", name: "inp" },\n', ""))), ["D029"]);
  assert.deepEqual(codes(await check("particles", (d) => sub(d, PD, ', inp: "In" }', " }"))), ["D029"]);
});

test("D030: a frame of 4 dims, and one with no note", async () => {
  assert.ok(codes(await check("maze", (d) => sub(d, MD, "dims: 2,", "dims: 4,"))).includes("D030"));
  assert.deepEqual(codes(await check("particles", (d) => sub(d, PD, 'note: "pixels in the bounds; x right, y down; (0, 0) is the top-left corner", ', ""))), ["D030"]);
});

test("D030: an extent(record) of the wrong shape, found when an example lowers", async () => {
  const r = await check("maze", (d) => sub(d, MD, "max: [record.grid[0].length - 0.5, record.grid.length - 0.5] })", "max: [record.grid.length] })"));
  assert.deepEqual(codes(r), ["K012"]);
  assert.match(r.diagnostics[0].message, /D030 frame 'cell': extent\(record\) gave \{"min":\[-0.5,-0.5\],"max":\[5\]\}/);
});

test("D031: a ref(\"in\") with no ports.in, and a slot named like a handle", async () => {
  let r = await check("maze", (d) => sub(sub(d, "maze.grammar.js", "name, data, lambda }", "name, data, lambda, ref }"), "maze.grammar.js", "tick: { kind", "sound: { kind: \"decl\", args: [ref(\"in\")] },\n        tick: { kind"));
  assert.deepEqual(codes(r), ["D031"]);
  assert.match(r.diagnostics[0].message, /declares no ports.in/);
  r = await check("maze", (d) => sub(d, "maze.grammar.js", "tick: { kind", "out: { kind: \"decl\", args: [data(\"number\")] },\n        tick: { kind"));
  assert.deepEqual(codes(r), ["D031"]);
  assert.equal(r.diagnostics[0].file, "maze.grammar.js");
});

test("G101: no Event output; G102: an Event with no tagged point; G103: a maze file names particles", async () => {
  assert.deepEqual(codes(await check("maze", (d) => sub(d, MD, 'seam: "Event<{ at: point2@cell }>", from: "picked"', 'seam: "f64", from: "score"'))), ["G101"]);
  assert.deepEqual(codes(await check("maze", (d) => sub(d, MD, "Event<{ at: point2@cell }>", "Event<{ at: vec2@cell }>"))), ["G102"]);
  assert.deepEqual(codes(await check("maze", (d) => sub(d, MD, "// The run's state", "// For particles: the run's state"))), ["G103"]);
});

test("G111: no Event input; G112: no ref(\"in\"); G113: no value input read; G103: a particles file names maze", async () => {
  assert.deepEqual(codes(await check("particles", (d) => sub(d, PD, 'seam: "Event<{ at: point2@px }>", note', 'seam: "f64", default: 0, note'))), ["G111"]);
  assert.deepEqual(codes(await check("particles", (d) => {
    sub(d, PG, ', "trigger?": ref("in")', "");
    sub(d, "examples/07.js", ', trigger: "burst"', "");
  })), ["G112"]);
  assert.deepEqual(codes(await check("particles", (d) => sub(d, "examples/07.js", "inp.radius", "40"))), ["G113"]);
  assert.deepEqual(codes(await check("particles", (d) => sub(d, PD, "// Pixels inside", "// Not maze: pixels inside"))), ["G103"]);
});

test("a ref(\"in\") that names no input is the kit's B003, with a did-you-mean", async () => {
  const r = await check("particles", (d) => sub(d, "examples/07.js", 'trigger: "burst"', 'trigger: "brust"'));
  assert.deepEqual(codes(r), ["K012"]);
  assert.match(r.diagnostics[0].message, /B003 .*there is no in 'brust'. Did you mean 'burst'\?/);
});

test("every D code of the Dialect additions and every author G code is exercised", () => {
  const want = [...Object.keys(SEAM_DEFINE_CODES), ...Object.keys(TASK_CODES).filter((c) => /^G1/.test(c))];
  assert.deepEqual(want.filter((c) => !seen.has(c)), []);
});
