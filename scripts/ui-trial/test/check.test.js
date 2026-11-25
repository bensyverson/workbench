// The UI trial checker: the passing fixtures check clean, and each code has a failing hand-in made from a
// fixture by a small edit. Each case also asserts the line it is reported at, where that is the point.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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
 * @param {Record<string, string | null>} [files]  whole files to write (null removes one)
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
  assert.equal(d.line, 17);
});
test("U001: a required key missing (state; a tile's title)", async () => {
  only(await check("maze", [["state: {", "stat: {"]]), "U001");
  only(await check("maze", [['title: "Score",', ""]]), "U001");
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

// U006
test("U006: a state leaf that is not a shape", async () => {
  const d = only(await check("maze", [['score: "number"', 'score: "f64"']]), "U006");
  assert.match(d.fix, /"number"/);
});
test("U006: an array literal for a list, and an empty state", async () => {
  only(await check("maze", [['grid: listOf("string")', 'grid: ["string"]']]), "U006");
  only(await check("maze", [
    ['t: "number",\n    score: "number",\n    coinsLeft: "number",\n    player: { x: "number", y: "number" },\n    grid: listOf("string"),', ""],
    ['value: "score" }', 'value: "Score" }'],
  ]).then((r) => ({ ...r, diagnostics: r.diagnostics.filter((d) => d.code === "U006") })), "U006");
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
  const r = await check("particles", [["(s) => s.particles.length < s.maxParticles", "(s, $) => { let n = s.particles.length; n += 1; return n <= s.maxParticles + Math.abs($.rate) + length(vec2(0, 0)) * 0; }"]]);
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
