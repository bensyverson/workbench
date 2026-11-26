// The draw trial's checker end to end, as a command: the reference hand-ins (fixtures/valid) pass every leg, and a
// copy broken in one way gives that way's code and still checks what it didn't break.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const CHECK = join(HERE, "check.js");
const HASH = join(HERE, "../pkg/hash.js");
const VALID = join(HERE, "fixtures/valid");

/** Runs the checker; its exit code and output. @param {string} dir @param {string} role */
function check(dir, role) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CHECK, dir, "--role", role], { encoding: "utf8" }) };
  } catch (e) {
    const err = /** @type {any} */ (e);
    return { code: err.status, out: String(err.stdout) + String(err.stderr) };
  }
}

/** The codes a run printed, in order. @param {string} out */
const codes = (out) => [...out.matchAll(/^[^\s:][^:]*:\d+: ([A-Z]+\d*) /gm)].map((m) => m[1]);

/**
 * A copy of the valid leg folder with one file edited (each [from, to] replaced once) and the package rehashed.
 * @param {string} file under fixtures/valid @param {Array<[string, string]>} edits
 */
function broken(file, edits) {
  const dir = mkdtempSync(join(tmpdir(), "e3qYus-legs-"));
  cpSync(VALID, dir, { recursive: true });
  const path = join(dir, file);
  let text = readFileSync(path, "utf8");
  for (const [from, to] of edits) { assert.ok(text.includes(from), `${file} holds ${from}`); text = text.replace(from, to); }
  writeFileSync(path, text);
  const pkg = file.split("/")[0];
  if (pkg !== "workbench.js") execFileSync(process.execPath, [HASH, join(dir, pkg)], { encoding: "utf8" });
  return dir;
}

test("the reference hand-ins pass every leg, and the composition draws the burst over the maze", () => {
  for (const role of ["maze", "particles"]) {
    const r = check(join(VALID, role), role);
    assert.equal(r.code, 0, r.out);
  }
  const r = check(VALID, "compose");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /run: burst of \d+ particles ops drawn over the maze/);
  assert.match(r.out, /painter's order level → sparks → cab/);
  assert.match(r.out, /gameboy \(arcade.screen\): refuses it/);
});

test("W024 places the coin through the maze's own frames when its picture is in another frame (the recorded compose leg)", () => {
  // the composer's maze draws in pixel (×8 +4 from cell); the checker once converted the coin's cell by the pixel edge
  const r = check(join(HERE, "runs/2026-11-26/compose"), "compose");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /run: burst of \d+ particles ops drawn over the maze within 8 of \(44, 68\)/);
});

/** @type {Array<{ name: string, file: string, edits: Array<[string, string]>, role: string, code: string, leg?: string }>} */
const CASES = [
  { name: "a builder calling map", file: "maze/maze.dialect.js", role: "maze", code: "W003",
    edits: [['{ each: "coins", from: (c, s) => ({ op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" }) },', '{ from: (s) => s.coins.map((c) => ({ op: "ellipse", at: [c.x, c.y], r: [0.25, 0.25], fill: "coin" })) },']] },
  { name: "a max its layers can pass", file: "maze/maze.dialect.js", role: "maze", code: "W005", edits: [["Draw<8193>@cell", "Draw<100>@cell"]] },
  { name: "an op with an unnamed color", file: "maze/maze.dialect.js", role: "maze", code: "W004", edits: [['fill: "hero"', 'fill: "teal"']] },
  { name: "a misspelled Draw seam", file: "maze/maze.dialect.js", role: "maze", code: "W002", edits: [["Draw<8193>@cell", "Draw<8193>"]] },
  { name: "a picture away from the player", file: "maze/maze.dialect.js", role: "maze", code: "W010", edits: [["at: [s.player.x - 0.4, s.player.y - 0.4]", "at: [-9, -9]"]] },
  { name: "a builder that throws", file: "particles/particles.dialect.js", role: "particles", code: "W006", edits: [["r: [p.size, p.size]", "r: [p.nope.size, p.size]"]] },
  { name: "a root that shows the maze", file: "workbench.js", role: "compose", code: "W020", leg: ".", edits: [[".show(cab)", ".show(level)"]] },
  { name: "a root with no HUD", file: "arcade/arcade.dialect.js", role: "compose", code: "W023", leg: ".", edits: [['...i.fx, { op: "text", at: [4, 4], str: "SCORE " + s.score, font: "mono", fill: "ink" }]', "...i.fx]"]] },
  { name: "a root that draws the burst under the maze", file: "arcade/arcade.dialect.js", role: "compose", code: "W024", leg: ".", edits: [["[...i.board, ...i.fx,", "[...i.fx, ...i.board,"]] },
  { name: "a root that drops the particles' picture", file: "arcade/arcade.dialect.js", role: "compose", code: "W022", leg: ".", edits: [["...i.fx, { op", "{ op"]] },
  { name: "a Draw wire into a smaller input", file: "arcade/arcade.dialect.js", role: "compose", code: "W021", leg: ".", edits: [['board: { seam: "Draw<8193>@screen"', 'board: { seam: "Draw<50>@screen"']] },
  { name: "a Draw wire across unrelated frames", file: "workbench.js", role: "compose", code: "S251", leg: ".", edits: [['    .frame(fx.frame.px, cab.frame.screen, { scale: 1, offset: [20, 20] })\n', ""]] },
];

for (const c of CASES) {
  test(`${c.name} is ${c.code}`, () => {
    const dir = broken(c.file, c.edits);
    try {
      const target = c.role === "compose" ? dir : join(dir, c.role);
      const r = check(target, c.role);
      assert.equal(r.code, 1, r.out);
      assert.ok(codes(r.out).includes(c.code), `${c.code} in:\n${r.out}`);
      if (c.code === "S251") assert.match(r.out, /Draw<…>@cell/, "a stand-in seam prints as a Draw seam");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
