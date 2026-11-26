// The UI trial checker: the passing fixtures check clean, and each code has a failing hand-in made from a
// fixture by a small edit. Each case also asserts the line it is reported at, where that is the point.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir, CheckTargetError } from "../checker/index.js";
import { UI_CODES } from "../checker/codes.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TRIAL = join(HERE, "..");
const PACKAGES = {
  particles: join(TRIAL, "../particles/reference"),
  maze: join(TRIAL, "packages/maze"),
};
const FIXTURE = {
  particles: ["particles.ui.js", "particles-field.js"],
  maze: ["maze.ui.js"],
};

/**
 * A hand-in: the package's definitions and the fixture's files, with `edits` applied to the files they name.
 * @param {"particles" | "maze"} lang
 * @param {Array<[string, string]>} [edits]  [from, to] pairs, each applied once to `<lang>.ui.js`
 * @param {Record<string, string | null>} [files]  whole files to write (null removes one, "<dir>" makes a directory)
 */
function handIn(lang, edits = [], files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vp27OC-ui-"));
  for (const f of [`${lang}.dialect.js`, `${lang}.grammar.js`]) copyFileSync(join(PACKAGES[lang], f), join(dir, f));
  for (const f of FIXTURE[lang]) copyFileSync(join(TRIAL, "fixtures/valid", f), join(dir, f));
  const ui = join(dir, `${lang}.ui.js`);
  let text = readFileSync(ui, "utf8");
  for (const [from, to] of edits) {
    assert.ok(text.includes(from), `fixture edit: '${from}' not found`);
    text = text.replace(from, () => to);
  }
  writeFileSync(ui, text);
  for (const [f, body] of Object.entries(files)) {
    if (body === null) rmSync(join(dir, f));
    else if (body === "<dir>") mkdirSync(join(dir, f));
    else writeFileSync(join(dir, f), body);
  }
  return dir;
}

/** @param {"particles" | "maze"} lang @param {Array<[string, string]>} [edits] @param {Record<string, string | null>} [files] */
async function check(lang, edits, files) {
  const dir = handIn(lang, edits, files);
  try { return await checkDir(dir, { lang }); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** @param {Awaited<ReturnType<typeof check>>} r */
const codes = (r) => r.diagnostics.map((d) => d.code);

/** One error with `code`, and nothing else. @param {Awaited<ReturnType<typeof check>>} r @param {string} code */
function only(r, code) {
  assert.deepEqual(codes(r), [code], JSON.stringify(r.diagnostics, null, 1));
  assert.equal(r.ok, false);
  const d = r.diagnostics[0];
  assert.ok(d.fix && d.fix.length > 0, "every diagnostic has a fix");
  return d;
}

test("the particles fixture checks clean", async () => {
  const r = await check("particles");
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ok, true);
});

test("the maze fixture checks clean", async () => {
  const r = await check("maze");
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.ok, true);
});

test("every UI code is documented in ui-draft.md and rules.md", () => {
  for (const doc of ["docs/ui-draft.md", "docs/rules.md"]) {
    const text = readFileSync(join(TRIAL, doc), "utf8");
    for (const c of Object.keys(UI_CODES)) assert.ok(text.includes(`| ${c} |`), `${doc} lacks ${c}`);
  }
});

test("a missing UI file is a target error", async () => {
  await assert.rejects(check("maze", [], { "maze.ui.js": null }), CheckTargetError);
});

// U001
test("U001: an unknown key, with a did-you-mean, at its line", async () => {
  const d = only(await check("particles", [['title: "Health"', 'titel: "Health"']]), "U001");
  assert.match(d.message, /titel/);
  assert.match(d.message, /Did you mean 'title'\?/);
  assert.equal(d.line, 9);
});
test("U001: a required key missing (a tile's title)", async () => {
  only(await check("maze", [['title: "Score",', ""]]), "U001");
});
test("U001: a state key in the UI says the state is declared in the Dialect", async () => {
  const d = only(await check("maze", [["defineUI(maze, {", 'defineUI(maze, {\n  state: { t: "number" },']]), "U001");
  assert.match(d.fix, /defineDialect/);
  assert.equal(d.line, 6);
});
test("U001: a component's unknown key", async () => {
  only(await check("maze", [['{ kind: "stat", label: "score", value: "score" }', '{ kind: "stat", label: "score", value: "score", color: "red" }']]), "U001");
});
test("U001: runs given ticks, not seconds (the unknown key and the missing one)", async () => {
  const r = await check("particles", [["seconds: 5", "ticks: 150"]]);
  assert.deepEqual(codes(r), ["U001", "U001"]);
  assert.match(r.diagnostics.map((d) => d.message + d.fix).join(" "), /ticks[\s\S]*seconds/);
});

// U002
test("U002: a kind that does not exist", async () => {
  const d = only(await check("maze", [['{ kind: "check"', '{ kind: "chek"']]), "U002");
  assert.match(d.message, /Did you mean 'check'\?/);
});

// U003
test("U003: a place that names nothing", async () => {
  const d = only(await check("maze", [['splitBelow: "stage"', 'splitBelow: "stag"']]), "U003");
  assert.match(d.message, /Did you mean 'stage'\?/);
});
test("U003: tiles placed in a cycle", async () => {
  only(await check("particles", [['splitRight: "stage", size: 0.3', 'splitRight: "sweep", size: 0.3']]), "U003");
});
test("U003: an annotate view that takes none, and a qualified id in a one-package page", async () => {
  only(await check("particles", [["traces: { t:", "ir: { t:"]]), "U003");
  only(await check("maze", [['splitBelow: "stage"', 'splitBelow: "fields.stage"']]), "U003");
});

// U004
test("U004: two directions, or none", async () => {
  only(await check("maze", [['place: { splitBelow: "stage" }', 'place: { splitBelow: "stage", splitRight: "stage" }']]), "U004");
  only(await check("maze", [['place: { splitBelow: "stage" }', "place: {}"]]), "U004");
});
test("U001 alone for a misspelled direction (no second U004)", async () => {
  only(await check("maze", [['place: { splitBelow: "stage" }', 'place: { below: "stage" }']]), "U001");
});
test("U004: a size out of range, or with tabWith", async () => {
  only(await check("particles", [["size: 0.3", "size: 1.5"]]), "U004");
  only(await check("particles", [['tabWith: "health"', 'tabWith: "health", size: 0.5']]), "U004");
});

// U005
test("U005: a path that names nothing, with a did-you-mean", async () => {
  const d = only(await check("maze", [['value: "coinsLeft"', 'value: "coinLeft"']]), "U005");
  assert.match(d.message, /Did you mean 'coinsLeft'\?/);
});
test("U005: a path into a list", async () => {
  only(await check("particles", [['rows: "emitters"', 'rows: "emitters.live"']]), "U005");
});
test("U005: a path of the wrong type for its key", async () => {
  only(await check("particles", [['rows: "emitters"', 'rows: "t"']]), "U005");
  only(await check("maze", [['value: "score" }', 'value: "player" }']]), "U005");
});
test("U005: a table column that is not a key of the row", async () => {
  only(await check("particles", [['columns: ["name", "live"', 'columns: ["name", "alive"']]), "U005");
});
test("U005: a traces annotation on something that is not a number", async () => {
  only(await check("particles", [["traces: { t:", "traces: { bounds:"]]), "U005");
});

// U006 is retired: the state is declared in the Dialect, where a bad one is D023 (a LOAD here: the definition is refused).
test("D023: a malformed state in the Dialect is a LOAD, at its line in the Dialect", async () => {
  const dialect = readFileSync(join(PACKAGES.maze, "maze.dialect.js"), "utf8");
  const bad = dialect.replace('score: "f64",', 'score: { n: "f64" },');
  const d = only(await check("maze", [], { "maze.dialect.js": bad }), "LOAD");
  assert.match(d.message, /D023/);
  assert.match(d.message, /struct/);
  assert.equal(d.file, "maze.dialect.js");
});

// U007
test("U007: a lambda that writes the state", async () => {
  const d = only(await check("maze", [["(s) => s.coinsLeft === 0", "(s) => { s.t = 0; return s.coinsLeft === 0; }"]]), "U007");
  assert.match(d.message, /assign/);
});
test("U007: a lambda that reads an undeclared member of the state, with a did-you-mean", async () => {
  const d = only(await check("maze", [["(s) => s.coinsLeft === 0", "(s) => s.coinLeft === 0"]]), "U007");
  assert.match(d.message, /Did you mean 'coinsLeft'\?/);
});
test("U007: a lambda that reads into a list's row by a key the row lacks", async () => {
  only(await check("particles", [["row.live / Math.max", "row.alive / Math.max"]]), "U007");
});
test("U007: a free name the Dialect does not give", async () => {
  only(await check("maze", [["(s) => s.coinsLeft === 0", "(s) => s.coinsLeft === LIMIT"]]), "U007");
  only(await check("maze", [["(s) => s.coinsLeft === 0", "(s) => Math.abs(s.coinsLeft) === 0"]]), "U007");
});
test("U007: more parameters than the convention, a lambda that does not parse, and one outside the subset", async () => {
  only(await check("maze", [["(s) => s.coinsLeft === 0", "(s, $, x) => s.coinsLeft === 0"]]), "U007");
  only(await check("maze", [["(s) => s.coinsLeft === 0", "(s) => { while (true) {} }"]]), "U007");
  only(await check("maze", [["(s) => s.coinsLeft === 0", "function (s) { return s.coinsLeft === 0; }"]]), "U007");
});
test("U007: a lambda may assign its own let locals and read the params and Dialect globals", async () => {
  // Math is a global, length an intrinsic, vec2 a declared vector (built in a lambda as vec2(x, y)).
  const r = await check("particles", [["(s) => s.particles.length < s.maxParticles", "(s, $) => { let n = 0; n += 1; return n <= s.maxParticles + Math.abs($.rate) + length(vec2(0, 0)) * 0; }"]]);
  assert.deepEqual(r.diagnostics, []);
  // A const local is not assignable.
  only(await check("particles", [["(s) => s.particles.length < s.maxParticles", "(s) => { const n = 1; n = 2; return n < s.maxParticles; }"]]), "U007");
});

// U008
test("U008: an element without the package prefix", async () => {
  const d = only(await check("particles", [['element: "particles-field"', 'element: "pt-field"']]), "U008");
  assert.match(d.fix, /particles-/);
});
test("U008: a module that is missing, not a package file, or does not define the tag", async () => {
  only(await check("particles", [], { "particles-field.js": null }), "U008");
  only(await check("particles", [['module: "./particles-field.js"', 'module: "https://cdn.example/f.js"']]), "U008");
  only(await check("particles", [], { "particles-field.js": "export const x = 1;\n" }), "U008");
});
test("U008: an element without a module", async () => {
  only(await check("particles", [['element: "particles-field", module: "./particles-field.js", emits: ["pick", "select"]', 'element: "particles-field", emits: ["pick"]']]), "U008");
});

// U009
test("U009: an event the contract does not have, and emits without an element", async () => {
  const d = only(await check("particles", [['emits: ["pick", "select"]', 'emits: ["pick", "click"]']]), "U009");
  assert.match(d.message, /click/);
  only(await check("maze", [['{ kind: "stat", label: "score", value: "score" }', '{ kind: "stat", label: "score", value: "score", emits: ["pick"] }']]), "U009");
});

// U010
test("U010: an inputs object that is not a Dialect object", async () => {
  const d = only(await check("maze", [['object: "Pad"', 'object: "Pads"']]), "U010");
  assert.match(d.message, /Did you mean 'Pad'\?/);
});
test("U010: buttons that are not exactly the object's members", async () => {
  only(await check("maze", [['b: { role: "b", label: "Wait" },', ""]]), "U010");
  only(await check("maze", [['b: { role: "b", label: "Wait" },', 'b: { role: "b", label: "Wait" },\n      start: { role: "start" },']]), "U010");
});
test("U010: an unknown role, and a role used twice", async () => {
  only(await check("maze", [['role: "dpad.left"', 'role: "dpad.lft"']]), "U010");
  only(await check("maze", [['role: "dpad.left"', 'role: "dpad.right"']]), "U010");
});

// U011
test("U011: a tile id that is a generated view's id", async () => {
  only(await check("maze", [["score: {\n      title", "params: {\n      title"]]), "U011");
});

// U012
test("U012: a number out of range or not whole", async () => {
  only(await check("particles", [["steps: 9", "steps: 1"]]), "U012");
  only(await check("particles", [["seconds: 5", "seconds: 0"]]), "U012");
  only(await check("particles", [["seconds: 5", "seconds: 3601"]]), "U012");
  only(await check("particles", [["window: 10", "window: 0"]]), "U012");
  only(await check("particles", [["from: 0, to: 400", "from: 400, to: 0"]]), "U012");
});
test("U012: a label that is not a string, an empty body, and a bad columns entry", async () => {
  only(await check("maze", [['label: "score", value: "score"', 'label: 3, value: "score"']]), "U012");
  only(await check("particles", [['columns: ["name", "live",', 'columns: [3, "live",']]), "U012");
  only(await check("particles", [['{ kind: "text", value: "Live particles after five seconds, by **rate**." },\n        { kind: "runs", label: "live by rate", param: "rate", from: 0, to: 400, steps: 9, seconds: 5, y: (s) => s.particles.length },', ""]]), "U012");
});

// U013
test("U013: defineUI given something other than the package's Grammar builder", async () => {
  only(await check("maze", [["defineUI(maze, {", "defineUI({}, {"]]), "U013");
});
test("U013: a Dialect that declares no state", async () => {
  const dialect = readFileSync(join(PACKAGES.maze, "maze.dialect.js"), "utf8");
  const a = dialect.indexOf("  state: {");
  const b = dialect.indexOf("  },\n", a) + 6;
  const d = only(await check("maze", [], { "maze.dialect.js": dialect.slice(0, a) + dialect.slice(b) }), "U013");
  assert.match(d.message, /declares no state/);
});

// The checker's own
test("C001: a UI file that never calls defineUI", async () => {
  only(await check("maze", [], { "maze.ui.js": "export const mazeUI = {};\n" }), "C001");
});
test("C006: an import from outside kit/define and the package", async () => {
  const d = only(await check("maze", [['import { maze } from "./maze.grammar.js";', 'import { maze } from "./maze.grammar.js";\nimport { readFileSync } from "node:fs";']]), "C006");
  assert.equal(d.line, 3);
});
test("LOAD: a UI file that does not load", async () => {
  only(await check("maze", [], { "maze.ui.js": "export const mazeUI = defineUI(;\n" }), "LOAD");
});

// Review findings (leaf ahT3go): holes and false refusals found by an independent review of the checker.
const P_EXPECT = "(s) => s.particles.length < s.maxParticles";
const MAZE_EXPECT = "(s) => s.coinsLeft === 0";
const FIELD = (/** @type {string} */ tag) => `customElements.define("${tag}", class extends HTMLElement {});\n`;

test("U007: a member chain from a Dialect global is checked against that object's members", async () => {
  const round = only(await check("particles", [[P_EXPECT, "(s) => Math.round(s.t) < s.maxParticles"]]), "U007");
  assert.match(round.message, /Math/);
  assert.match(round.message, /round/);
  const random = only(await check("particles", [[P_EXPECT, "(s) => Math.random() < 0.5"]]), "U007");
  assert.match(random.message, /reproducible/);
  assert.match(random.fix, /rng\(\)/);
  only(await check("particles", [[P_EXPECT, '(s) => Math["random"]() < 0.5']]), "U007");
  // What the object does declare, and an object filled per program, still work.
  assert.deepEqual((await check("particles", [[P_EXPECT, "(s) => Math.abs(s.t) < Math.PI + Math.max(1, 2)"]])).diagnostics, []);
  assert.deepEqual((await check("particles", [[P_EXPECT, "(s) => counters.spawned >= 0"]])).diagnostics, []);
  // A local of the same name is not the global.
  assert.deepEqual((await check("particles", [[P_EXPECT, "(s) => { const Math = 1; return Math < s.maxParticles; }"]])).diagnostics, []);
});

test("U007: (row) => row is fine over a list of leaves, refused over a list of objects and for the state", async () => {
  const table = '{ kind: "table", label: "Grid", rows: "grid", columns: [{ label: "row", value: (row) => row }] },';
  const pass = await check("maze", [['{ kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },', `{ kind: "check", label: "all coins", expect: (s) => s.coinsLeft === 0 },\n        ${table}`]]);
  assert.deepEqual(pass.diagnostics, []);
  only(await check("particles", [["(row, s) => row.live / Math.max", "(row, s) => row / Math.max"]]), "U007");
  only(await check("maze", [[MAZE_EXPECT, "(s) => s === 0"]]), "U007");
});

test("U008: the module defines the tag in code (a const tag, window.customElements), not in a comment or a string", async () => {
  only(await check("particles", [], { "particles-field.js": '// customElements.define("particles-field", X)\nexport {};\n' }), "U008");
  only(await check("particles", [], { "particles-field.js": "/* customElements.define('particles-field', X) */\n" }), "U008");
  only(await check("particles", [], { "particles-field.js": 'const doc = \'customElements.define("particles-field", X)\';\n' }), "U008");
  only(await check("particles", [], { "particles-field.js": 'customElements.define("particles-other", class extends HTMLElement {});\n' }), "U008");
  only(await check("particles", [], { "particles-field.js": 'const TAG = "particles-other";\ncustomElements.define(TAG, class extends HTMLElement {});\n' }), "U008");
  for (const body of [
    'const TAG = "particles-field";\nclass F extends HTMLElement {}\ncustomElements.define(TAG, F);\n',
    'class F extends HTMLElement {}\nwindow.customElements.define("particles-field", F);\n',
    "customElements.define(`particles-field`, class extends HTMLElement {});\n",
    '// a comment first\ncustomElements.define( \'particles-field\' , class extends HTMLElement {});\n',
  ]) assert.deepEqual((await check("particles", [], { "particles-field.js": body })).diagnostics, [], body);
});

test("U008: the tag is lowercase with a hyphen under the package prefix, as the draft says", async () => {
  const swap = (/** @type {string} */ tag) => check("particles", [['element: "particles-field"', `element: "${tag}"`]], { "particles-field.js": FIELD(tag) });
  // The draft says only "lowercase, with a hyphen" after the package prefix: HTML's `_` and `.` are allowed.
  for (const tag of ["particles-my_field", "particles-a.b", "particles-x2", "particles-a-b-c"]) assert.deepEqual((await swap(tag)).diagnostics, [], tag);
  for (const tag of ["particles-Field", "particles-", "particles", "Particles-field", "pt-field", "particles-fie ld"]) only(await swap(tag), "U008");
});

test("U007: members of Object.prototype are not declared state", async () => {
  only(await check("maze", [[MAZE_EXPECT, "(s) => s.constructor === 0"]]), "U007");
  only(await check("maze", [[MAZE_EXPECT, "(s) => s.player.toString() === 0"]]), "U007");
  only(await check("particles", [["row.live / Math.max", "row.hasOwnProperty / Math.max"]]), "U007");
  only(await check("maze", [['value: "score" }', 'value: "constructor" }']]), "U005");
  only(await check("maze", [['value: "score" }', 'value: "player.toString" }']]), "U005");
});

test("U010: inputs with no buttons are refused", async () => {
  const noButtons = [['object: "Pad"', 'object: "Params"'], ['up: { role: "dpad.up" },\n      down: { role: "dpad.down" },\n      left: { role: "dpad.left" },\n      right: { role: "dpad.right" },\n      a: { role: "a", label: "Dash" },\n      b: { role: "b", label: "Wait" },', ""]];
  const r = await check("maze", /** @type {Array<[string, string]>} */ (noButtons));
  assert.ok(codes(r).includes("U010"), JSON.stringify(r.diagnostics));
  assert.match(r.diagnostics.find((d) => d.code === "U010")?.message ?? "", /no buttons/);
});

test("U008: a module path that is a directory is a diagnostic, not a crash", async () => {
  const d = only(await check("particles", [['module: "./particles-field.js"', 'module: "./sub.js"']], { "sub.js": "<dir>" }), "U008");
  assert.match(d.message, /sub\.js/);
});

test("a UI file that is a directory is a target error", async () => {
  const dir = handIn("maze", [], { "maze.ui.js": null });
  mkdirSync(join(dir, "maze.ui.js"));
  try { await assert.rejects(checkDir(dir, { lang: "maze" }), CheckTargetError); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the CLI appends a log line for every invocation: ok, violations, a target error, a bad invocation", async () => {
  const CLI = join(TRIAL, "check.js");
  const logDir = mkdtempSync(join(tmpdir(), "ahT3go-log-"));
  const log = join(logDir, "log.jsonl");
  const run = (/** @type {string[]} */ args) => spawnSync("node", [CLI, ...args], { env: { ...process.env, UI_TRIAL_LOG: log }, encoding: "utf8" });
  const lines = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  const good = handIn("maze");
  const bad = handIn("maze", [["(s) => s.coinsLeft === 0", "(s) => s.nope === 0"]]);
  try {
    assert.equal(run([good, "--lang", "maze"]).status, 0);
    assert.equal(run([bad, "--lang", "maze"]).status, 1);
    assert.equal(run([join(logDir, "missing"), "--lang", "maze"]).status, 4);
    assert.equal(run(["--lang", "maze"]).status, 2);
    assert.equal(run([good, "--lang", "Not A Name"]).status, 2);
    assert.equal(lines().length, 5);
    assert.deepEqual(lines().map((l) => l.ok), [true, false, false, false, false]);
    assert.match(lines()[3].loadError, /usage/);
  } finally {
    for (const d of [good, bad, logDir]) rmSync(d, { recursive: true, force: true });
  }
});

test("LOAD names a file in the hand-in, never hooks.js or a kit file", async () => {
  const helper = "export const x = 1;\nthrow new Error('boom');\n";
  const r = await check("maze", [['import { maze } from "./maze.grammar.js";', 'import { maze } from "./maze.grammar.js";\nimport "./helper.js";']], { "helper.js": helper });
  const d = only(r, "LOAD");
  assert.equal(d.file, "helper.js");
  assert.equal(d.line, 2);
  // A throw from inside kit/define (a definition refused) is placed at the call in the hand-in's file.
  const k = only(await check("maze", [['import { maze } from "./maze.grammar.js";', 'import { maze } from "./maze.grammar.js";\nimport { defineDialect } from "kit/define";\ndefineDialect({ name: "x" });']]), "LOAD");
  assert.equal(k.file, "maze.ui.js");
  assert.equal(k.line, 4);
  // A syntax error's stack names no file (Node prints the location on stderr only), so it is the UI file, line 1.
  const s = only(await check("maze", [], { "maze.ui.js": "import { defineUI } from \"kit/define\";\nexport const mazeUI = defineUI(;\n" }), "LOAD");
  assert.equal(s.file, "maze.ui.js");
  assert.equal(s.line, 1);
});

test("lines: two identical lambdas are placed at their own lines, and a comment quoting one is not it", async () => {
  const head = 'import { defineUI } from "kit/define";\nimport { maze } from "./maze.grammar.js";\n';
  const ui = (/** @type {string} */ pre) => `${head}${pre}export const mazeUI = defineUI(maze, {
  tiles: {
    one: { title: "One", place: { splitBelow: "stage" }, body: [{ kind: "check", label: "a", expect: (s) => s.nope > 0 }] },
    two: { title: "Two", place: { splitBelow: "one" }, body: [{ kind: "check", label: "b", expect: (s) => s.nope > 0 }] },
  },
});
`;
  const two = await check("maze", [], { "maze.ui.js": ui("") });
  assert.deepEqual(two.diagnostics.map((d) => `${d.code}@${d.line}`), ["U007@5", "U007@6"]);
  const commented = await check("maze", [], { "maze.ui.js": ui("// expect: (s) => s.nope > 0 was the first try\n") });
  assert.deepEqual(commented.diagnostics.map((d) => `${d.code}@${d.line}`), ["U007@6", "U007@7"]);
  // A declaration whose tiles are built above the call is still placed (searched from the top of the file).
  const above = `${head}const tiles = {\n  one: { title: "One", place: { splitBelow: "stag" }, body: [{ kind: "stat", label: "a", value: "t" }] },\n};\nexport const mazeUI = defineUI(maze, { tiles });\n`;
  assert.deepEqual((await check("maze", [], { "maze.ui.js": above })).diagnostics.map((d) => `${d.code}@${d.line}`), ["U003@4"]);
});

test("C006: process.getBuiltinModule and a deferred import() are refused, in code only", async () => {
  const at = 'import { maze } from "./maze.grammar.js";';
  const g = only(await check("maze", [[at, `${at}\nconst fs = process.getBuiltinModule("node:fs");`]]), "C006");
  assert.equal(g.line, 3);
  assert.match(g.message, /getBuiltinModule/);
  const i = only(await check("maze", [[at, `${at}\nimport("node:fs");`]]), "C006");
  assert.equal(i.line, 3);
  only(await check("maze", [[at, `${at}\nsetTimeout(() => import("node:fs"), 0);`]]), "C006");
  only(await check("maze", [[at, `${at}\nimport "./helper.js";`]], { "helper.js": 'const fs = process.getBuiltinModule("node:fs");\n' }), "C006");
  // The words in a comment or a string are not code.
  const ok = await check("maze", [[at, `${at}\n// import("node:fs") and process.getBuiltinModule\nconst note = "process.getBuiltinModule";`]]);
  assert.deepEqual(ok.diagnostics, []);
});

test("U003: a qualified id, even the package's own, is an error on a one-package page", async () => {
  const d = only(await check("maze", [['splitBelow: "stage"', 'splitBelow: "maze.stage"']]), "U003");
  assert.match(d.message, /maze\.stage/);
  assert.match(d.fix, /stage/);
  only(await check("particles", [["traces: { t:", '"particles.traces": { t:']]), "U003");
});

test("U001: an element on a row or col is refused (layouts draw nothing of their own)", async () => {
  const r = await check("particles", [['{ kind: "row", items: [', '{ kind: "row", element: "particles-bar", module: "./particles-field.js", items: [']]);
  assert.ok(codes(r).includes("U001"), JSON.stringify(r.diagnostics));
});
