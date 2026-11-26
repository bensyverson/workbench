// The composer's leg: the assembled hand-in checks clean with its conversion plan, and every S code, every
// composer G code, C006 and LOAD has a failing copy made by a small edit of the glue or of a package.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRole } from "../checker/index.js";
import { COMPOSE_CODES, TASK_CODES } from "../checker/codes.js";
import { handIn, sub, remove } from "../fixture-copy.js";

/** Codes the cases below saw. @type {Set<string>} */
const seen = new Set();

/** @param {(dir: string) => void} edit @param {{ stale?: boolean }} [o] */
async function check(edit, o) {
  const dir = await handIn("compose", edit, o);
  try {
    const r = await checkRole(dir, "compose");
    for (const d of r.diagnostics) seen.add(d.code);
    return r;
  } finally { remove(dir); }
}
/** @param {{ diagnostics: Array<{ code: string }> }} r */
const codes = (r) => r.diagnostics.map((d) => d.code);
const W = "workbench.js", MD = "maze/maze.dialect.js", PD = "particles/particles.dialect.js";
const FRAME = '.frame(level.frame.cell, fx.frame.px, "fit")';
const EDGE = ".frame(level.frame.cell, fx.frame.px, { scale: CELL, offset: [CELL / 2, CELL / 2 + (320 - 8 * CELL) / 2] })";
const WIRE = ".wire(level.out.picked, fx.in.burst)";
/** Adds an output to the maze Dialect. @param {string} d @param {string} port */
const mazeOut = (d, port) => sub(d, MD, '      score: { seam: "f64"', `      ${port}\n      score: { seam: "f64"`);
/** Adds an input to the particles Dialect. @param {string} d @param {string} port */
const fxIn = (d, port) => sub(d, PD, '      radius: { seam: "f64@px"', `      ${port}\n      radius: { seam: "f64@px"`);

test("the compose hand-in checks clean, with the wire's conversion plan", async () => {
  const r = await check(() => {});
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.wires, [{ from: "level.out.picked", to: "fx.in.burst", convert: ["at: maze.cell → particles.px, point, ×32 +[16, 48]"], dropped: [] }]);
});

test("a producer's extra record fields are dropped on the wire, and the plan lists them", async () => {
  const r = await check((d) => {
    sub(d, MD, 'picked: list(struct({ at: "cell2" }), 8),', 'picked: list(struct({ at: "cell2", value: "f64" }), 8),');
    sub(d, MD, '"Event<{ at: point2@cell }>"', '"Event<{ at: point2@cell, value: f64 }>"');
  });
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.wires?.[0].dropped, ["value"]);
});

test("S101: two parts with one name", async () => {
  const r = await check((d) => sub(d, W, 'particles("fx")', 'particles("level")'));
  assert.deepEqual(codes(r), ["S101"]);
  assert.deepEqual(r.diagnostics[0].from, { part: "level", dialect: "maze", version: "0.2.0" });
  assert.deepEqual(r.diagnostics[0].to, { part: "level", dialect: "particles", version: "0.3.0" });
});

test("S102: a wire whose ends are swapped, and a show of something that is not a part", async () => {
  const r = await check((d) => sub(d, W, WIRE, ".wire(fx.in.burst, level.out.picked)"));
  assert.deepEqual(codes(r), ["S102", "S102"]);
  assert.deepEqual(r.diagnostics[0].from, { part: "fx", dialect: "particles", version: "0.3.0", port: "in.burst", seam: "Event<{ at: point2@px }>" });
  assert.deepEqual(r.diagnostics[1].to, { part: "level", dialect: "maze", version: "0.2.0", port: "out.picked", seam: "Event<{ at: point2@cell }>" });
  assert.deepEqual(codes(await check((d) => sub(d, W, ".show(fx)", ".show(42)"))), ["S102"]);
});

test("S111: a misspelled input, with what the part has and a did-you-mean", async () => {
  const r = await check((d) => sub(d, W, "fx.in.burst", "fx.in.brust"));
  assert.deepEqual(codes(r), ["S111"]);
  assert.match(r.diagnostics[0].message, /has no input 'brust'. Did you mean 'burst'\? Its inputs: burst, radius/);
  assert.equal(r.diagnostics[0].file, W);
  assert.equal(r.diagnostics[0].line, 42);
  assert.deepEqual(r.diagnostics[0].from, { part: "level", dialect: "maze", version: "0.2.0", port: "out.picked", seam: "Event<{ at: point2@cell }>" });
  assert.deepEqual(r.diagnostics[0].to, { part: "fx", dialect: "particles", version: "0.3.0", port: "in.brust", has: ["burst", "radius"] });
});

test("S112: an input wired twice", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, WIRE, `${WIRE}\n    ${WIRE}`))), ["S112"]);
});

test("S113: a required input with no wire", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, PD, "default: 40,", "required: true,"))), ["S113"]);
});

test("S114: a part wired to itself", async () => {
  const r = await check((d) => {
    sub(d, PD, "  ports: {\n    in: {", '  ports: {\n    out: { clock: { seam: "f64@px", from: "t", note: "seconds, pretending to be pixels" } },\n    in: {');
    sub(d, W, WIRE, `${WIRE}\n    .wire(fx.out.clock, fx.in.radius)`);
  });
  assert.deepEqual(codes(r), ["S114"]);
});

test("S201: a scalar into an Event input, with both sides and the draft's print shape", async () => {
  const r = await check((d) => sub(d, W, WIRE, ".wire(level.out.score, fx.in.burst)"));
  assert.deepEqual(codes(r), ["S201"]);
  const d = r.diagnostics[0];
  assert.deepEqual(d.from, { part: "level", dialect: "maze", version: "0.2.0", port: "out.score", seam: "f64" });
  assert.deepEqual(d.to, { part: "fx", dialect: "particles", version: "0.3.0", port: "in.burst", seam: "Event<{ at: point2@px }>" });
  assert.ok(d.fix);
});

test("S202: a record field the input takes and the output lacks", async () => {
  const r = await check((d) => sub(d, PD, 'burst: { seam: "Event<{ at: point2@px }>"', 'burst: { seam: "Event<{ at: point2@px, size: f64 }>"'));
  assert.deepEqual(codes(r), ["S202"]);
  assert.match(r.diagnostics[0].message, /no field 'size'/);
});

test("S203: an enum the input does not accept; S204: a list longer than its max", async () => {
  const r = await check((d) => {
    sub(d, MD, "vector } from", "vector, enumOf } from");
    sub(d, MD, 'picked: list(struct({ at: "cell2" }), 8),', 'picked: list(struct({ at: "cell2" }), 8),\n    mood: enumOf(["calm", "wild"]),');
    mazeOut(d, `mood: { seam: "'calm' | 'wild'", from: "mood" },\n      recent: { seam: "list<{ at: point2@cell }, 8>", from: "picked", note: "the coins of this tick" },`);
    fxIn(d, `mood: { seam: "'calm'", default: "calm" },\n      seeds: { seam: "list<{ at: point2@px }, 4>", default: [], note: "where to seed" },`);
    sub(d, W, WIRE, `${WIRE}\n    .wire(level.out.mood, fx.in.mood)\n    .wire(level.out.recent, fx.in.seeds)`);
  });
  assert.deepEqual(codes(r), ["S203", "S204"]);
});

test("S251: tagged on both sides and no frame path, with the draft's fix", async () => {
  const r = await check((d) => sub(d, W, `    ${FRAME}\n`, ""));
  assert.deepEqual(codes(r), ["S251"]);
  assert.match(r.diagnostics[0].fix, /\.frame\(level\.frame\.cell, fx\.frame\.px, "fit"\)/);
});

test("S252: an untagged number into a tagged input", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, WIRE, `${WIRE}\n    .wire(level.out.score, fx.in.radius)`))), ["S252"]);
});

test("S253: two frame paths that disagree, naming the edges of both", async () => {
  const r = await check((d) => sub(d, W, FRAME, `${FRAME}\n    .frame(fx.frame.px, level.frame.cell, { scale: 0.5 })`));
  assert.deepEqual(codes(r), ["S253"]);
  assert.match(r.diagnostics[0].message, /scale: 0\.5.*scale: 32/);
});

test("S254: a quantity across a scale that differs per axis", async () => {
  const r = await check((d) => {
    mazeOut(d, 'reach: { seam: "f64@cell", from: "score", note: "how far the player reaches, in cells" },');
    sub(d, W, FRAME, EDGE.replace("{ scale: CELL, offset:", "{ scale: [CELL, CELL / 2], offset:"));
    sub(d, W, WIRE, `${WIRE}\n    .wire(level.out.reach, fx.in.radius)`);
  });
  assert.deepEqual(codes(r), ["S254"]);
});

test("S255: a point into a vector", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, PD, 'seam: "Event<{ at: point2@px }>"', 'seam: "Event<{ at: vec2@px }>"'))), ["S255"]);
});

test("S256: fit with a frame that declares no extent", async () => {
  const r = await check((d) => {
    sub(d, PD, ', extent: (record) => ({ min: [0, 0], max: [record.bounds.width, record.bounds.height] })', "");
  });
  assert.deepEqual(codes(r), ["S256"]);
});

test("an explicit edge plans the same conversion as fit for this pair", async () => {
  const r = await check((d) => sub(d, W, FRAME, EDGE));
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.wires?.[0].convert, ["at: maze.cell → particles.px, point, ×32 +[16, 48]"]);
});

test("S257: an edge with a scale of 0", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, FRAME, EDGE.replace("{ scale: CELL, offset:", "{ scale: 0, offset:")))), ["S257"]);
});

test("S301: a handle in arithmetic, and a handle tested in a condition", async () => {
  let r = await check((d) => sub(d, W, "  return compose(", "  const twice = level.out.picked * 2;\n  return compose("));
  assert.deepEqual(codes(r), ["S301"]);
  assert.equal(r.diagnostics[0].line, 38);
  r = await check((d) => sub(d, W, "  return compose(", "  if (fx.in.burst) { /* nothing */ }\n  return compose("));
  assert.deepEqual(codes(r), ["S301"]);
});

test("a part that does not build stops with its own diagnostic, prefixed with the part's name", async () => {
  const r = await check((d) => sub(d, W, ".start({ x: 1, y: 1 })", ""));
  assert.deepEqual(codes(r), ["B005"]);
  assert.match(r.diagnostics[0].message, /^part 'level' \(maze\): /);
});

test("G001: the burst wired into an input no emitter triggers on", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, ', trigger: "burst"', ""))), ["G001"]);
});

test("G002: the wired output says nothing of a pickup or a goal", async () => {
  const r = await check((d) => {
    sub(d, MD, 'picked: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "a coin the player picked up during this tick, at its cell; empty most ticks" }', 'ev: { seam: "Event<{ at: point2@cell }>", from: "picked", note: "something happened" }');
    sub(d, W, "level.out.picked", "level.out.ev");
  });
  assert.deepEqual(codes(r), ["G002"]);
});

test("G003: the position crosses untagged, with no frame of the glue", async () => {
  const r = await check((d) => {
    sub(d, MD, "Event<{ at: point2@cell }>", "Event<{ at: vec2 }>");
    sub(d, PD, "Event<{ at: point2@px }>", "Event<{ at: vec2 }>");
    sub(d, W, `    ${FRAME}\n`, "");
  });
  assert.deepEqual(codes(r), ["G003"]);
});

test("G004: the composition shows the maze", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, ".show(fx)", ".show(level)"))), ["G004"]);
});

test("G005: a package file edited by the composer (its hash no longer matches)", async () => {
  const r = await check((d) => sub(d, MD, "// The run's state", "// The composer was here. The run's state"), { stale: true });
  assert.deepEqual(codes(r), ["K006", "G005"]);
  assert.equal(r.diagnostics[1].file, "maze/maze.dialect.js");
});

test("G006: a default export that returns a part, not a composition", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, '  return compose("coin-bursts")', '  return level;\n  compose("coin-bursts")'))), ["G006"]);
});

test("C006: the glue imports a Node built-in", async () => {
  const r = await check((d) => sub(d, W, 'import { compose } from "kit/compose";', 'import { compose } from "kit/compose";\nimport { readFileSync } from "node:fs";'));
  assert.deepEqual(codes(r), ["C006"]);
  assert.equal(r.diagnostics[0].line, 2);
});

test("LOAD: a glue program that does not parse", async () => {
  const r = await check((d) => sub(d, W, "const CELL = 32;", "const CELL = ;"));
  assert.deepEqual(codes(r), ["LOAD"]);
});

test("a quantity's conversion in the record is one magnitude, even across a flip", async () => {
  const g = /** @type {any} */ (globalThis);
  delete g.__seamsRecord;
  const r = await check((d) => {
    mazeOut(d, 'reach: { seam: "f64@cell", from: "score", note: "how far the player reaches, in cells" },');
    sub(d, W, FRAME, '.frame(level.frame.cell, fx.frame.px, { scale: [-32, 32], offset: [320, 16] })\n    .wire(level.out.reach, fx.in.radius)');
    sub(d, W, '  return compose("coin-bursts")', '  const c = compose("coin-bursts")');
    sub(d, W, ".show(fx);", ".show(fx);\n  globalThis.__seamsRecord = c.build();\n  return c;");
  });
  assert.deepEqual(r.diagnostics, []);
  const record = g.__seamsRecord;
  delete g.__seamsRecord;
  const reach = record.wires.find((/** @type {any} */ w) => w.from === "level.out.reach");
  assert.deepEqual(reach.convert, [{ field: "", kind: "quantity", from: "maze.cell", to: "particles.px", scale: [32], offset: [0] }]);
});

test("C006: a dynamic import, process and require are found in the glue's syntax tree", async () => {
  for (const line of ['  import("node:fs");', '  process.getBuiltinModule("node:fs").readdirSync(".");', '  const fs = require("node:fs");']) {
    const r = await check((d) => sub(d, W, "export default ($) => {", `export default ($) => {\n${line}`));
    assert.deepEqual(codes(r), ["C006"], line);
    assert.equal(r.diagnostics[0].line, 29, line);
  }
});

test("C006, not LOAD: a bare import of a package's other file", async () => {
  const r = await check((d) => sub(d, W, 'import { particles } from "particles";', 'import { particles } from "particles";\nimport { mazeDialect } from "maze/maze.dialect.js";'));
  assert.deepEqual(codes(r), ["C006"]);
  assert.equal(r.diagnostics[0].line, 4);
});

test("a BigInt scale is S257, not a crash", async () => {
  assert.deepEqual(codes(await check((d) => sub(d, W, FRAME, ".frame(level.frame.cell, fx.frame.px, { scale: 32n, offset: 16 })"))), ["S257"]);
});

test("a check that throws inside the composition is a coded diagnostic, not a crash", async () => {
  const r = await check((d) => sub(d, W, FRAME, '.frame(level.frame.cell, fx.frame.px, { get scale() { throw new Error("boom"); } })'));
  assert.deepEqual(codes(r), ["LOAD"]);
  assert.match(r.diagnostics[0].message, /boom/);
});

test("S251 across frames of different dims says no edge can join them, not fit", async () => {
  const r = await check((d) => {
    sub(d, MD, "  frames: {\n", '  frames: {\n    tick: { dims: 1, note: "ticks", extent: () => ({ min: [0], max: [1] }) },\n');
    mazeOut(d, 'clock: { seam: "f64@tick", from: "t", note: "time in ticks" },');
    sub(d, W, WIRE, `${WIRE}\n    .wire(level.out.clock, fx.in.radius)`);
  });
  assert.deepEqual(codes(r), ["S251"]);
  assert.doesNotMatch(r.diagnostics[0].fix, /fit/);
  assert.match(r.diagnostics[0].message, /1 dims.*2 dims|different dims/);
});

test("a .build() thrown inside the glue keeps its own lines", async () => {
  const r = await check((d) => { sub(d, W, `    ${FRAME}\n`, ""); sub(d, W, ".show(fx);", ".show(fx).build();"); });
  assert.deepEqual(codes(r), ["S251"]);
  assert.equal(r.diagnostics[0].line, 41);
});

test("an async default export is G006, saying it returned a Promise", async () => {
  const r = await check((d) => sub(d, W, "export default ($) => {", "export default async ($) => {"));
  assert.deepEqual(codes(r), ["G006"]);
  assert.match(r.diagnostics[0].message, /Promise/);
});

test("every S code and every composer G code is exercised", () => {
  const want = [...Object.keys(COMPOSE_CODES), ...Object.keys(TASK_CODES).filter((c) => /^G0/.test(c)), "C006", "LOAD"];
  assert.deepEqual(want.filter((c) => !seen.has(c)), []);
});
