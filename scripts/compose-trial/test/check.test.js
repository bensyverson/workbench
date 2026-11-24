// The composition trial's checker. The passing fixture checks clean; every code has a fixture that trips it
// (a small edit of the passing fixture, in a temp directory) at the right file and line, whether it is found
// while the program builds, when a lambda's source is read, or when the parts are cross-checked at the end;
// and the CLI prints, exits and logs as rules.md and the README say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir, CODES } from "../checker/index.js";

/** @import { CheckDiagnostic } from "../checker/index.js" */

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "valid");
const CLI = join(HERE, "..", "check.js");
const P = "program.js", LIB = "lib/noise.js";

/** @typedef {{ file?: string, from: string, to: string }} Edit */

/**
 * A copy of the passing fixture with each edit applied (`from` must occur exactly once).
 * @param {Edit[]} edits
 */
function fixture(edits) {
  const dir = mkdtempSync(join(tmpdir(), "compose-trial-"));
  cpSync(VALID, dir, { recursive: true });
  for (const e of edits) {
    const path = join(dir, e.file ?? P), src = readFileSync(path, "utf8");
    assert.equal(src.split(e.from).length, 2, `fixture edit: '${e.from}' must occur once in ${e.file ?? P}`);
    writeFileSync(path, src.replace(e.from, e.to));
  }
  return dir;
}

/** @param {Edit[]} edits */
async function checkEdited(edits) {
  const dir = fixture(edits);
  try { return await checkDir(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** @param {CheckDiagnostic[]} ds */
const show = (ds) => ds.map((d) => `${d.file}:${d.line}: ${d.code} ${d.message}`).join("\n");

/** The 1-based line of the first line of `file` in the passing fixture containing `needle`. */
function lineOf(/** @type {string} */ needle, file = P) {
  const n = readFileSync(join(VALID, file), "utf8").split("\n").findIndex((l) => l.includes(needle)) + 1;
  assert.ok(n > 0, `'${needle}' is not in ${file}`);
  return n;
}

/**
 * One failing fixture per code (some twice, where the checker finds the code in two places).
 * @type {Array<{ code: string, why?: string, edits: Edit[], line: number, file?: string, message?: RegExp, fix?: RegExp, also?: string[] }>}
 */
const FAILING = [
  // The checker's own.
  { code: "C001", edits: [{ from: `export default program("Spore Run").show(torch);`, to: "export default torch;" }], line: lineOf("export default"), message: /program\(/ },
  { code: "C001", edits: [{ from: `program("Spore Run").show(torch)`, to: `program("Spore Run")` }], line: lineOf("export default"), message: /show/ },
  { code: "C002", edits: [{ from: ".show(torch)", to: `.show(glow("extra").size(64, 64).light(p => p.color))` }], line: lineOf("export default"), message: /const/ },
  { code: "C003", edits: [{ from: "const COLS = 24;", to: "const COLS = ;" }], line: lineOf("const COLS"), message: /SyntaxError/ },
  { code: "C003", edits: [{ from: `from "glow";`, to: `from "shader";` }], line: lineOf(`from "glow";`), message: /shader/ },
  { code: "C004", edits: [{ from: "$.reach * 8 + 4", to: "$.reaches * 8 + 4" }], line: lineOf("$.reach * 8 + 4"), message: /reaches.*did you mean 'reach'/i },
  { code: "C004", edits: [{ from: "10 - $.reach", to: "10 - $.reech" }], line: lineOf("10 - $.reach"), message: /reech/, also: ["G005"] },
  { code: "C003", why: "a dynamic import", edits: [{ from: "const COLS = 24;", to: 'const fs = await import("node:fs");\nconst COLS = 24;' }], line: lineOf("const COLS"), message: /node:fs/ },
  { code: "C003", why: "a dynamic import with a computed specifier", edits: [{ from: "const COLS = 24;", to: 'const fs = await import("node" + ":fs");\nconst COLS = 24;' }], line: lineOf("const COLS"), message: /node:fs/ },
  { code: "C003", why: "an indented import call", edits: [{ from: "const COLS = 24;", to: 'if (true) {\n  import("node:fs");\n}\nconst COLS = 24;' }], line: lineOf("const COLS") + 1, message: /node:fs/ },
  { code: "C003", why: "an indented static import", edits: [{ from: "const COLS = 24;", to: ' import os from "node:os";\nconst COLS = 24;' }], line: lineOf("const COLS"), message: /node:os/ },
  { code: "C003", why: "export from", edits: [{ from: "const COLS = 24;", to: 'export { readFileSync } from "node:fs";\nconst COLS = 24;' }], line: lineOf("const COLS"), message: /node:fs/ },
  { code: "C003", why: "export star from", edits: [{ from: "const COLS = 24;", to: 'export * from "node:os";\nconst COLS = 24;' }], line: lineOf("const COLS"), message: /node:os/ },
  { code: "C003", why: "a dynamic import in a lib/ file", file: LIB, edits: [{ file: LIB, from: "export const hash", to: 'const fs = await import("node:fs");\nexport const hash' }], line: lineOf("export const hash", LIB), message: /node:fs/ },
  // A dialect's.
  { code: "D001", edits: [{ from: ".smooth(3)", to: ".smoothe(3)" }], line: lineOf(".smooth(3)"), message: /smoothe.*did you mean 'smooth'/i },
  { code: "D001", edits: [{ from: ".smooth(3)", to: `.clock("tick")` }], line: lineOf(".smooth(3)"), message: /clock.*demand/ },
  { code: "D002", edits: [{ from: ".smooth(3)", to: `.smooth("3")` }], line: lineOf(".smooth(3)"), message: /smooth/ },
  { code: "D002", edits: [{ from: ".screen(COLS * 8, ROWS * 8)", to: ".screen(COLS * 8 + 3, ROWS * 8)" }], line: lineOf(".screen("), message: /multiple of 8/ },
  { code: "D003", edits: [{ from: `\n  .exit({ where: c => c.x > 18 });`, to: ";" }], line: lineOf(`cave("depths")`), message: /exit/ },
  { code: "D004", edits: [{ from: ".smooth(3)", to: ".smooth(3).smooth(2)" }], line: lineOf(".smooth(3)"), message: /once/ },
  { code: "D005", edits: [{ from: "c.y * 0.2 + c.seed)", to: "c.y * 0.2 + c.seeds)" }], line: lineOf("c.seed)"), message: /seeds/ },
  { code: "D005", edits: [{ from: "w.state.picked += 1", to: "w.state.pickd += 1" }], line: lineOf("w.state.picked += 1"), message: /pickd/ },
  { code: "D006", edits: [{ from: ".player(Picker)", to: ".player(Shroom)" }], line: lineOf(".player(Picker)"), message: /once/ },
  { code: "D006", edits: [{ from: "const COLS = 24;", to: `const COLS = 24;\nconst Ghost = actor("Ghost").look({ color: "#fff" });` }], line: lineOf("const COLS") + 1, message: /Ghost/ },
  { code: "D007", edits: [{ from: "    const d = distance(p.xy, game.out.player);", to: "    let d = 0; for (const q of [p.xy]) d = distance(q, game.out.player);" }], line: lineOf("const d = distance"), message: /for…of|for\.\.\.of/ },
  // The kernel subset (kit/parse's own codes).
  { code: "S104", edits: [{ from: `w.emit("picked"`, to: "w.emit(`picked`" }], line: lineOf(`w.emit("picked"`) },
  { code: "P004", edits: [{ from: "w.move(self, w.input.dir * 1.2);", to: "function f() {} w.move(self, w.input.dir * 1.2);" }], line: lineOf("w.move(self") },
  // Seams.
  { code: "S201", edits: [{ from: ".size(COLS, ROWS)", to: ".size(COLS + 2, ROWS)" }], line: lineOf(".map(level.out.cells"), message: /26×16.*24×16/ },
  { code: "S202", edits: [{ from: `{ rock: "wall", open: "floor" }`, to: `{ rock: "wall" }` }], line: lineOf(".map(level.out.cells"), message: /open/ },
  { code: "S202", edits: [{ from: `{ rock: "wall", open: "floor" }`, to: `{ rock: "wall", open: "flor" }` }], line: lineOf(".map(level.out.cells"), message: /flor/ },
  { code: "S203", edits: [{ from: ".over(game.out.image)", to: ".over(game.out.player)" }], line: lineOf(".over("), message: /Image@px/, also: ["G002"] },
  { code: "S203", edits: [{ from: "distance(p.xy, game.out.exit)", to: "distance(p.xy, level.out.spawns)" }], line: lineOf("distance(p.xy, game.out.exit)"), message: /GPU/ },
  { code: "S204", edits: [{ from: `kind: "shroom", init`, to: `kind: "shrooms", init` }], line: lineOf(`kind: "shroom", init`), message: /shrooms/ },
  { code: "S251", edits: [{ from: `{ kind: "start", init: s => ({ pos: tile(s.at) }) }`, to: `{ kind: "start", init: s => ({ pos: s.at }) }` }], line: lineOf(`kind: "start", init`), message: /vec2@px.*vec2i@cell/, fix: /tile\(s\.at\)/ },
  { code: "S251", edits: [{ from: "distance(p.xy, game.out.exit)", to: "distance(p.xy, level.out.exit)" }], line: lineOf("distance(p.xy, game.out.exit)"), message: /px.*cell|cell.*px/ },
  { code: "S251", edits: [{ from: "w => tile(level.out.exit)", to: "w => level.out.exit" }], line: lineOf(`.export("exit"`), message: /vec2@px/ },
  { code: "S301", edits: [{ from: ".seed(() => $.seed * 31 + game.out.round)", to: ".seed($.seed * 31 + game.out.round)" }], line: lineOf(".seed("), message: /game\.out.*build/, fix: /\(\) =>/ },
  { code: "S301", edits: [{ from: `.sample(game.out.player, "lerp")`, to: `.sample(game.out.player, "lerp")\n  .tint([1, 1, 1 - game.out.picked * 0.01])` }], line: lineOf(".sample(") + 1, message: /game\.out\.picked/ },
  { code: "S301", edits: [{ from: `.sample(game.out.player, "lerp")`, to: `.sample(game.out.player, "lerp")\n  .tint(game.out.picked)` }], line: lineOf(".sample(") + 1, message: /tint/, fix: /\(\) =>/ },
  ...[
    ["a strict comparison", "const flag = game.out.round === 3;"],
    ["a negation", "const flag = !game.out.round;"],
    ["a ternary", "const flag = game.out.round ? 1 : 2;"],
    ["&&", "const flag = game.out.round && 1;"],
    ["||", "const flag = game.out.round || 1;"],
    ["??", "const flag = game.out.round ?? 1;"],
    ["an if", "if (game.out.round) { }"],
  ].map(([how, stmt]) => ({ code: "S301", why: how, edits: [{ from: 'const torch = glow("torch")', to: `${stmt}\nconst torch = glow("torch")` }], line: lineOf('const torch = glow("torch")'), message: /game\.out\.round.*build/ })),
  { code: "S302", edits: [{ from: ".screen(COLS * 8, ROWS * 8)", to: ".screen(COLS * 8, level.out.exit)" }], line: lineOf(".screen("), message: /screen/ },
  { code: "S311", edits: [{ from: "distance(p.xy, game.out.player)", to: "distance(p.xy, game.out.players)" }], line: lineOf("const d = distance"), message: /players.*did you mean 'player'/i },
  { code: "S311", edits: [{ from: `.sample(game.out.player, "lerp")`, to: `.sample(game.out.playr, "lerp")` }], line: lineOf(".sample("), message: /playr/ },
  { code: "S312", edits: [{ from: "distance(p.xy, game.out.player)", to: "distance(p.xy, game.player)" }], line: lineOf("const d = distance"), message: /inside part 'game'/, fix: /read the output: game\.out\.player/ },
  { code: "S312", edits: [{ from: "distance(p.xy, game.out.player)", to: "distance(p.xy, game.actors)" }], line: lineOf("const d = distance"), message: /game\.actors/, fix: /export it from game/ },
  { code: "S312", edits: [{ from: ".over(game.out.image)", to: ".over(game.image)" }], line: lineOf(".over("), message: /game\.image/, fix: /game\.out\.image/, also: ["G002"] },
  { code: "S312", edits: [{ from: "const lit = 1", to: "const lit = Shroom.pos.x + 1" }], line: lineOf("const lit = 1"), message: /Shroom/ },
  { code: "S313", edits: [{ from: "w.state.picked += 1", to: "w.state.picked = game.out.picked + 1" }], line: lineOf("w.state.picked += 1"), message: /own output/ },
  { code: "S321", edits: [{ from: `.sample(game.out.player, "lerp")`, to: `.sample(game.out.player, "smooth")` }], line: lineOf(".sample("), message: /smooth/ },
  { code: "S321", edits: [{ from: `.sample(game.out.player, "lerp")`, to: `.sample(level.out.cells, "lerp")` }], line: lineOf(".sample("), message: /lerp/ },
  { code: "S331", edits: [{ from: "noise(p.t * 3, 0)", to: "Math.sin(p.t * 3)" }], line: lineOf("noise(p.t * 3, 0)"), message: /Math/, also: ["G004"] },
  { code: "S331", file: LIB, edits: [{ file: LIB, from: "fract(sin(", to: "fract(Math.sin(" }], line: lineOf("fract(sin(", LIB), message: /Math/ },
  { code: "S331", edits: [{ from: "const lit = 1", to: "const lit = brightness + 1" }], line: lineOf("const lit = 1"), message: /brightness/ },
  { code: "S332", edits: [{ from: "distance(p.xy, game.out.exit)", to: "distance(p.xy, tile(level.out.exit))" }], line: lineOf("distance(p.xy, game.out.exit)"), message: /tile.*tiles/ },
  // The task.
  { code: "G001", edits: [
    { from: `{ kind: "start", init: s => ({ pos: tile(s.at) }) }`, to: `{ kind: "start", init: s => ({ pos: s.at * 8 }) }` },
    { from: "init: s => ({ pos: tile(s.at), home: tile(s.at) })", to: "init: s => ({ pos: s.at * 8, home: s.at * 8 })" },
    { from: "w => tile(level.out.exit)", to: "w => level.out.exit * 8" },
  ], line: 1, message: /tile\(\)/ },
  { code: "G002", edits: [
    { from: "distance(p.xy, game.out.player)", to: "distance(p.xy, p.size * 0.5)" },
    { from: "distance(p.xy, game.out.exit)", to: "distance(p.xy, vec2(0, 0))" },
  ], line: 1 },
  { code: "G003", edits: [{ from: ".seed(() => $.seed * 31 + game.out.round)", to: ".seed(7)" }], line: 1 },
  { code: "G004", edits: [{ from: "noise(p.t * 3, 0)", to: "sin(p.t * 3)" }], line: 1, message: /noise/ },
  { code: "G004", why: "a helper named but not called", edits: [{ from: "noise(p.t * 3, 0)", to: "(noise ? 1 : 0)" }], line: 1, message: /noise/ },
  { code: "G001", why: "tile(cell(px)) converts a pixel, not a cave cell", edits: [
    { from: `{ kind: "start", init: s => ({ pos: tile(s.at) }) }`, to: `{ kind: "start", init: s => ({ pos: s.at * 8 }) }` },
    { from: "init: s => ({ pos: tile(s.at), home: tile(s.at) })", to: "init: s => ({ pos: s.at * 8, home: s.at * 8 })" },
    { from: "w => tile(level.out.exit)", to: "w => level.out.exit * 8" },
    { from: `.export("round", "int", w => w.state.round)`, to: `.export("round", "int", w => w.state.round)\n  .export("here", "vec2@px", w => tile(cell(w.player.pos)))` },
  ], line: 1, message: /cave/ },
  { code: "G005", edits: [{ from: "10 - $.reach", to: "6" }], line: 1 },
];

test("the passing fixture checks clean", async () => {
  const r = await checkDir(VALID);
  assert.deepEqual(r.diagnostics, [], show(r.diagnostics));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.files).sort(), [LIB, P]);
});

for (const f of FAILING) {
  test(`${f.code}${f.why ? ` (${f.why})` : ""}: ${f.edits[0].to.slice(0, 60)}`, async () => {
    const r = await checkEdited(f.edits);
    const hit = r.diagnostics.find((d) => d.code === f.code);
    const stray = r.diagnostics.filter((d) => d.code !== f.code && !(f.also ?? []).includes(d.code));
    assert.deepEqual(stray, [], `one mistake, one diagnostic: knock-on codes besides ${f.code}:\n${show(stray)}`);
    assert.ok(hit, `expected ${f.code}; got:\n${show(r.diagnostics)}`);
    assert.equal(r.ok, false);
    assert.equal(hit.file, f.file ?? P, show([hit]));
    assert.equal(hit.line, f.line, show([hit]));
    if (f.message) assert.match(hit.message, f.message);
    if (f.fix) assert.match(hit.fix, f.fix);
    assert.ok(hit.fix.length > 0, "every diagnostic carries a fix");
  });
}

/** Codes only the CLI's isolated run can report (a candidate that ends, hangs or crashes the checker), tested below. */
const CLI_ONLY = ["C005"];

test("every code rules.md lists has a failing fixture", () => {
  const tested = new Set([...FAILING.map((f) => f.code), ...CLI_ONLY]);
  for (const code of Object.keys(CODES)) assert.ok(tested.has(code), `no failing fixture for ${code}`);
});

test("every code in the codes table is in rules.md, and every seam code is in the draft's table", () => {
  const rules = readFileSync(join(HERE, "..", "docs", "rules.md"), "utf8");
  const draft = readFileSync(join(HERE, "..", "docs", "composition-draft.md"), "utf8");
  for (const code of Object.keys(CODES)) {
    assert.ok(rules.includes(code), `${code} is not in rules.md`);
    if (/^S[23]/.test(code)) assert.ok(draft.includes(`| ${code} |`), `${code} is not in the draft's table`);
  }
});

/** The passing fixture with each part's factory call moved after a line break or a comment. */
for (const [how, to] of [["a line break", "=\n  "], ["a block comment", "= /* the level */ "], ["a line comment", "= // the level\n  "]]) {
  test(`C002: a factory call after ${how} is still bound to its const`, async () => {
    const r = await checkEdited([
      { from: 'const level = cave("depths")', to: `const level ${to}cave("depths")` },
      { from: 'const Picker = actor("Picker")', to: `const Picker ${to}actor("Picker")` },
      { from: "const $ = params(", to: `const $ ${to}params(` },
    ]);
    assert.equal(show(r.diagnostics), "");
  });
}

test("S301: a handle read inside a lambda, as a comparison or a ternary, is not a build-time read", async () => {
  const r = await checkEdited([{ from: '.sample(game.out.player, "lerp")', to: '.sample(game.out.player, "lerp")\n  .tint(() => (game.out.round === 3 ? [1, 1, 1] : [1, 0.5, 1]))' }]);
  assert.equal(show(r.diagnostics), "");
});

test("a second check of the same directory loads the files afresh", async () => {
  const dir = fixture([]);
  try {
    assert.equal((await checkDir(dir)).ok, true);
    const path = join(dir, P);
    writeFileSync(path, readFileSync(path, "utf8").replace(".smooth(3)", ".smoothe(3)"));
    assert.ok((await checkDir(dir)).diagnostics.some((d) => d.code === "D001"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** @param {string[]} args @param {Record<string, string>} [env] */
const cli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("CLI: a clean directory exits 0 and says so", () => {
  const r = cli([VALID]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no violations/);
});

test("CLI: violations exit 1, each as <file>:<line>: <code> <message> and a fix line; the log records the run", () => {
  const dir = fixture([{ from: ".smooth(3)", to: ".smoothe(3)" }]);
  const log = join(dir, "log.jsonl");
  try {
    const r = cli([dir], { COMPOSE_TRIAL_LOG: log });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`${P.replace(".", "\\.")}:${lineOf(".smooth(3)")}: D001 `));
    assert.match(r.stdout, /\n {2}fix: /);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    assert.equal(entry.ok, false);
    assert.ok(entry.files[P].includes(".smoothe(3)"));
    assert.ok(entry.diagnostics.some((/** @type {CheckDiagnostic} */ d) => d.code === "D001"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: --json prints the result as one object", () => {
  const r = cli([VALID, "--json"]);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).ok, true);
});

test("CLI: a bad invocation exits 2; a missing directory or program.js exits 4", () => {
  assert.equal(cli([]).status, 2);
  assert.equal(cli([join(VALID, "nope")]).status, 4);
  const dir = mkdtempSync(join(tmpdir(), "compose-trial-"));
  try { assert.equal(cli([dir]).status, 4); } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ok(existsSync(VALID));
});

/**
 * Runs the CLI on the fixture with `edits`, in a temp directory.
 * @param {Edit[]} edits @param {Record<string, string>} [env]
 */
function cliOn(edits, env = {}) {
  const dir = fixture(edits);
  try { return cli([dir], env); } finally { rmSync(dir, { recursive: true, force: true }); }
}

for (const [how, stmt, say] of /** @type {Array<[string, string, RegExp]>} */ ([
  ["ends the process", "process.exit(0);", /ended the check/],
  ["loops forever", "while (true) {}", /did not finish/],
  ["rejects a promise nobody handles", 'Promise.reject(new Error("x"));', /unhandled rejection.*Error: x/],
  ["waits forever at the top level", "await new Promise(() => {});", /ended the check/],
])) {
  test(`C005: a program.js that ${how} is a diagnostic and a nonzero exit, not a pass`, () => {
    const r = cliOn([{ from: "const COLS = 24;", to: `${stmt}\nconst COLS = 24;` }], { COMPOSE_TRIAL_TIMEOUT_MS: "3000" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /C005/);
    assert.match(r.stdout, say);
    assert.doesNotMatch(r.stdout, /no violations/);
  });
}
