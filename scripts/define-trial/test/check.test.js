// The Definition API trial's checker: it runs the real kit/define over a candidate. The passing fixture
// checks clean; each code has a fixture that trips it (a one-edit mutation of the passing fixture, in a temp
// directory) at the right file and line, whether the kit finds it at the define call, at a builder call, at
// .check() or when lowering; and the CLI prints, exits and logs as rules.md and the README say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDir, CHECK_CODES, RETIRED_CODES } from "../checker/index.js";
import { DEFINE_CODES, BUILD_CODES } from "../../../kit/define/index.js";

/** @import { CheckDiagnostic } from "../checker/index.js" */

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "valid");
const CLI = join(HERE, "..", "check.js");
const KIT_DEFINE_URL = pathToFileURL(join(HERE, "..", "..", "..", "kit", "define", "index.js")).href;
const DIALECT = "data.dialect.js", GRAMMAR = "data.grammar.js", EX1 = "examples/01.js", EX2 = "examples/02.js";

/** @typedef {{ file: string, from: string, to: string }} Edit */

/**
 * A copy of the passing fixture with each edit applied (`from` must occur exactly once).
 * @param {Edit[]} edits
 * @param {Record<string, string>} [extra] files to add, by path
 * @param {string[]} [remove] files or directories to delete first, by path
 */
function fixture(edits, extra = {}, remove = []) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-"));
  cpSync(VALID, dir, { recursive: true });
  for (const r of remove) rmSync(join(dir, r), { recursive: true, force: true });
  for (const e of edits) {
    const path = join(dir, e.file), src = readFileSync(path, "utf8");
    assert.equal(src.split(e.from).length, 2, `fixture edit: '${e.from}' must occur once in ${e.file}`);
    writeFileSync(path, src.replace(e.from, e.to));
  }
  for (const [file, text] of Object.entries(extra)) writeFileSync(join(dir, file), text);
  return dir;
}

/**
 * Checks a mutated copy of the fixture, then removes it.
 * @param {Edit[]} edits @param {Record<string, string>} [extra] @param {string[]} [remove]
 */
async function checkEdited(edits, extra, remove) {
  const dir = fixture(edits, extra, remove);
  try { return await checkDir(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** @param {CheckDiagnostic[]} ds */
const show = (ds) => ds.map((d) => `${d.file}:${d.line}: ${d.code} ${d.message}`).join("\n");

/**
 * The line (1-based) of the first line of `file` in the passing fixture that contains `needle`.
 * @param {string} file @param {string} needle
 */
function lineOf(file, needle) {
  const n = readFileSync(join(VALID, file), "utf8").split("\n").findIndex((l) => l.includes(needle)) + 1;
  assert.ok(n > 0, `'${needle}' is not in ${file}`);
  return n;
}

const STEP_RETURN = "          return state;\n";
const IMPORT_LINE = `import { program } from "../data.grammar.js";`;

/**
 * One failing fixture per code (some codes twice, where the kit finds them in two places): the edits, and
 * where the diagnostic must point.
 * @type {Array<{ code: string, why?: string, edits: Edit[], extra?: Record<string, string>, remove?: string[], file: string, line?: number, message?: RegExp }>}
 */
const FAILING = [
  // At defineDialect / defineGrammar: the kit's DefinitionError, located by the problem's path.
  { code: "D001", edits: [{ file: DIALECT, from: "  intrinsics: {", to: "  intrinsic: {" }], file: DIALECT, line: lineOf(DIALECT, "  intrinsics: {"), message: /intrinsic\b.*did you mean 'intrinsics'/i },
  { code: "D002", edits: [{ file: DIALECT, from: `returns: "color", space`, to: `returns: "colour", space` }], file: DIALECT, line: lineOf(DIALECT, "pixel: { params"), message: /colour/ },
  { code: "D003", edits: [{ file: DIALECT, from: `spell: { js: "Math.sin($0)", glsl: "sin($0)" }`, to: `spell: { js: "Math.sin($0)" }` }], file: DIALECT, line: lineOf(DIALECT, "sin: {"), message: /sin.*glsl/ },
  { code: "D004", edits: [{ file: DIALECT, from: "ref: Math.sin, ", to: "" }], file: DIALECT, line: lineOf(DIALECT, "sin: {"), message: /sin.*ref/ },
  { code: "D005", edits: [{ file: DIALECT, from: `returns: "color", space: "pixel"`, to: `returns: "color", space: "pixels"` }], file: DIALECT, line: lineOf(DIALECT, "pixel: { params"), message: /pixels/ },
  { code: "D006", edits: [{ file: DIALECT, from: `accepts: ["pixel"]`, to: `accepts: ["pixel", "row"]` }], file: DIALECT, line: lineOf(DIALECT, "glsl: { accepts"), message: /row/ },
  { code: "D007", edits: [{ file: DIALECT, from: "    HALF: { const", to: "    sin: { const" }], file: DIALECT, message: /sin/ },
  { code: "D008", edits: [{ file: DIALECT, from: "tolerance(1e-3)", to: "tolerance(0)" }], file: DIALECT, line: lineOf(DIALECT, "glsl: { accepts") },
  { code: "D009", edits: [{ file: GRAMMAR, from: `args: [lambda("pixel")], once`, to: `args: [lambda("blend")], once` }], file: GRAMMAR, line: lineOf(GRAMMAR, `pixel: { kind: "decl"`), message: /blend/ },
  { code: "D010", edits: [{ file: GRAMMAR, from: "mute: { kind", to: "pixel: { kind" }], file: GRAMMAR, message: /pixel/ },
  { code: "D011", edits: [{ file: GRAMMAR, from: `rest(data("string"))`, to: `rest(data("text"))` }], file: GRAMMAR, line: lineOf(GRAMMAR, "tags: {"), message: /text/ },
  { code: "D012", edits: [{ file: DIALECT, from: "pure: true", to: "pure: false" }], file: DIALECT, line: lineOf(DIALECT, "spaces: {") },
  { code: "D013", edits: [{ file: DIALECT, from: `"(x, n) => x - n * floor(x / n)"`, to: `"(x, n) => x - n * floor(x / n"` }], file: DIALECT, line: lineOf(DIALECT, "pmod:"), message: /pmod/ },
  { code: "D014", edits: [{ file: GRAMMAR, from: `kind: "decl", args: [rest`, to: `kind: "list", args: [rest` }], file: GRAMMAR, line: lineOf(GRAMMAR, "tags: {"), message: /list/ },
  { code: "D015", edits: [{ file: GRAMMAR, from: `      record: "calls",\n`, to: "" }], file: GRAMMAR, message: /record/ },
  { code: "D017", edits: [{ file: GRAMMAR, from: `as: "params"`, to: `as: "tags"` }], file: GRAMMAR, message: /tags/ },
  { code: "D018", edits: [{ file: GRAMMAR, from: "tags: { kind", to: "then: { kind" }], file: GRAMMAR, line: lineOf(GRAMMAR, "tags: {"), message: /then/ },
  { code: "D021", why: "effects on an intrinsic", edits: [{ file: DIALECT, from: `spell: { js: "Math.sin($0)", glsl: "sin($0)" }`, to: `spell: { js: "Math.sin($0)", glsl: "sin($0)" }, effects: ["rng"]` }], file: DIALECT, line: lineOf(DIALECT, "sin: {"), message: /sin.*pure/ },
  { code: "D022", why: "a slot outside an instance space that takes its instance", edits: [{ file: DIALECT, from: "spaces: { pixel: { pure: true } }", to: `spaces: { pixel: { pure: true }, mark: { instance: "Uniforms" } }` }], file: DIALECT, line: lineOf(DIALECT, "pixel: { params"), message: /pixel.*Uniforms/ },
  { code: "D020", edits: [{ file: DIALECT, from: "  text: (state) => JSON.stringify(state),\n", to: "" }], file: DIALECT, message: /text\(state\)/ },
  { code: "D019", edits: [{ file: GRAMMAR, from: "      opens: [name()],", to: `      opens: [name(), lambda("pixel")],` }], file: GRAMMAR, message: /lambda/ },
  // At a builder call: B001 is thrown at once, the rest collected.
  { code: "B001", edits: [{ file: EX1, from: `.mute("glow")`, to: `.mut("glow")` }], file: EX1, line: lineOf(EX1, ".mute("), message: /mut\b.*did you mean 'mute'/i },
  { code: "B002", why: "a second construct with state under a taken name", edits: [{ file: EX1, from: `.layer("echo"`, to: `.layer("halo"` }], file: EX1, line: lineOf(EX1, `.layer("echo"`), message: /halo/ },
  { code: "B004", edits: [{ file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: `{ value: "fast" }` }], file: EX1, line: lineOf(EX1, ".param("), message: /speed|param/ },
  { code: "B006", edits: [{ file: EX2, from: `.pixel("(uv, u) => color(uv.x, 0, 0)");`, to: `.pixel("(uv, u) => color(uv.x, 0, 0)").pixel("(uv, u) => color(0, 0, 0)");` }], file: EX2, line: lineOf(EX2, ".pixel("), message: /pixel/ },
  { code: "B007", edits: [{ file: EX1, from: "(c, u) => c.glow + c.base", to: "function (c, u) { return c.glow + c.base; }" }], file: EX1, line: lineOf(EX1, `.channel("pulse"`), message: /function/ },
  { code: "B009", edits: [{ file: EX2, from: `  .pixel("(uv, u)`, to: `  .shader("void main() {}").pixel("(uv, u)` }], file: EX2, line: lineOf(EX2, ".pixel("), message: /shader text/ },
  { code: "T001", why: "a Dialect's own slot check", edits: [{ file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: 9, min: 0, max: 8 }" }], file: EX1, line: lineOf(EX1, ".param("), message: /above its max/ },
  // At .check(): every name is known.
  { code: "B003", why: "a Program namespace", edits: [{ file: EX1, from: `.layer("halo", { speed: "speed" })`, to: `.layer("halo", { speed: "sped" })` }], file: EX1, line: lineOf(EX1, `.layer("halo"`), message: /sped.*did you mean 'speed'/i },
  { code: "B005", edits: [{ file: EX2, from: `.pixel("(uv, u) => color(uv.x, 0, 0)")`, to: `.tags("x")` }], file: EX2, line: lineOf(EX2, "export default"), message: /pixel/ },
  { code: "B008", edits: [{ file: EX1, from: "const w = 0.01;", to: "const w = WIDTH;" }], file: EX1, line: lineOf(EX1, `.fn("ring"`), message: /WIDTH/ },
  // Module scope: the checker passes each example's top-level bindings and its build-time-only names (one line added after the import).
  { code: "B012", edits: [{ file: EX1, from: IMPORT_LINE, to: `${IMPORT_LINE}\nconst WIDTH = new Map();` }, { file: EX1, from: "const w = 0.01;", to: "const w = WIDTH;" }], file: EX1, line: lineOf(EX1, `.fn("ring"`) + 1, message: /WIDTH.*Map/ },
  { code: "B013", edits: [{ file: EX1, from: IMPORT_LINE, to: `${IMPORT_LINE}\nfunction setup() { const WIDTH = 0.01; return WIDTH; }` }, { file: EX1, from: "const w = 0.01;", to: "const w = WIDTH;" }], file: EX1, line: lineOf(EX1, `.fn("ring"`) + 1, message: /WIDTH.*build-time/ },
  { code: "B014", why: "a run-time-only member of the params, read at build", edits: [{ file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: $.now, min: 0, max: 8 }" }], file: EX1, line: lineOf(EX1, ".param("), message: /\$\.now.*runs/ },
  { code: "B015", why: "the params read other than by name", edits: [{ file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: Object.keys($).length + 2, min: 0, max: 8 }" }], file: EX1, line: lineOf(EX1, ".param("), message: /by name/ },
  { code: "B016", why: "the root opened twice in one run", edits: [{ file: EX1, from: `export default ($) => program("glow")`, to: `export default ($) => (program("spare"), program("glow"))` }], file: EX1, line: lineOf(EX1, "export default"), message: /second Program, tint 'glow', after tint 'spare'/ },
  { code: "B017", why: "the root opened, and something else returned", edits: [{ file: EX1, from: "    return c;\n  });", to: "    return c;\n  }) && 0;" }], file: EX1, line: lineOf(EX1, "export default"), message: /opens tint 'glow' but returns 0/ },
  { code: "B002", why: "a top-level binding named like a Dialect name", edits: [{ file: EX1, from: IMPORT_LINE, to: `${IMPORT_LINE}\nconst sin = 1;` }], file: EX1, line: lineOf(EX1, "export default") + 1, message: /top-level 'sin'/ },
  // When lowering: construct state, conventions and each lambda's body.
  { code: "B003", why: "a state namespace, at that step", edits: [{ file: EX1, from: `.mute("glow")`, to: `.mute("glw")` }], file: EX1, line: lineOf(EX1, ".mute("), message: /glw.*did you mean 'glow'/i },
  { code: "B010", edits: [{ file: EX1, from: `.layer("halo", { speed: "speed" })`, to: `.layer("halo", { speed: "speed", from: "echo" })` }], file: EX1, line: lineOf(EX1, `.layer("halo"`), message: /halo/ },
  { code: "B011", edits: [{ file: EX1, from: `.channel("late", (c, u) => c.pulse * 0.5)`, to: `.channel("late", (c, u) => c.pulse * 0.5).channel("more", (c, u) => c.late)` }], file: EX1, line: lineOf(EX1, `.channel("late"`), message: /at most four channels/ },
  { code: "L002", why: "at the line inside a multi-line lambda", edits: [{ file: EX1, from: "uv - vec2(HALF, HALF)", to: "uv - vec2(HALF, u.aspct)" }], file: EX1, line: lineOf(EX1, "uv - vec2(HALF, HALF)"), message: /aspct.*did you mean 'aspect'/i },
  { code: "L002", why: "in a lambda given as source text", edits: [{ file: EX2, from: "color(uv.x, 0, 0)", to: "color(uv.x, u.aspct, 0)" }], file: EX2, line: lineOf(EX2, ".pixel("), message: /aspct/ },
  { code: "D002", why: "in what a convention function returned, when lowering", edits: [{ file: DIALECT, from: `state.channels), "Uniforms"]`, to: `state.channels), "Uniformz"]` }], file: DIALECT, message: /Uniformz/ },
  // The checker's own codes.
  { code: "C001", edits: [{ file: EX1, from: "export default ($) => program", to: "const p = program" }], file: EX1, line: 1 },
  { code: "C005", edits: [{ file: GRAMMAR, from: STEP_RETURN, to: "          return state.missing.channels;\n" }], file: GRAMMAR, line: lineOf(GRAMMAR, STEP_RETURN.trim()), message: /examples\/01\.js.*TypeError/ },
  { code: "C006", why: "an import in the Dialect", edits: [{ file: DIALECT, from: "import { defineDialect", to: `import os from "node:os";\nimport { defineDialect` }], file: DIALECT, line: lineOf(DIALECT, "import { defineDialect"), message: /node:os/ },
  { code: "C006", why: "a Node built-in in an example", edits: [{ file: EX1, from: "import { program }", to: `import fs from "node:fs";\nimport { program }` }], file: EX1, line: 1, message: /node:fs/ },
  { code: "C006", why: "kit/define by a path, not by its name", edits: [{ file: EX1, from: "import { program }", to: `import { defineDialect } from "${KIT_DEFINE_URL}";\nimport { program }` }], file: EX1, line: 1 },
  { code: "C006", why: "a dynamic import", edits: [{ file: EX2, from: "export default", to: `await import("node:os");\nexport default` }], file: EX2, line: lineOf(EX2, "export default"), message: /node:os/ },
  { code: "C007", remove: ["examples"], edits: [], file: "examples", line: 1 },
  { code: "LOAD", edits: [{ file: DIALECT, from: `name: "tint",`, to: `name: "tint",,` }], file: DIALECT, line: lineOf(DIALECT, `name: "tint",`) },
];

test("the passing fixture checks clean, lowering included", async () => {
  const r = await checkDir(VALID);
  assert.equal(show(r.diagnostics), "");
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.files).sort(), [DIALECT, GRAMMAR, EX1, EX2, "examples/03.js"].sort());
});

test("every checker code, every D code and every B code the kit defines has a failing fixture", () => {
  const covered = new Set(FAILING.map((f) => f.code));
  for (const code of [...Object.keys(CHECK_CODES), ...Object.keys(DEFINE_CODES), ...Object.keys(BUILD_CODES)]) assert.ok(covered.has(code), `no failing fixture for ${code}`);
});

test("the codes v0 had and the kit now reports are retired, each naming the code that replaced it", () => {
  assert.deepEqual(RETIRED_CODES, { C002: "B007", C003: "B008", C004: "B001" });
  for (const old of Object.keys(RETIRED_CODES)) assert.ok(!(old in CHECK_CODES), old);
});

for (const f of FAILING) {
  test(`${f.code}${f.why ? ` (${f.why})` : ""}: ${CHECK_CODES[/** @type {keyof typeof CHECK_CODES} */ (f.code)] ?? DEFINE_CODES[/** @type {keyof typeof DEFINE_CODES} */ (f.code)] ?? BUILD_CODES[/** @type {keyof typeof BUILD_CODES} */ (f.code)] ?? "a code from the kit"}`, async () => {
    const r = await checkEdited(f.edits, f.extra, f.remove);
    assert.equal(r.ok, false);
    const hit = r.diagnostics.filter((d) => d.code === f.code);
    assert.ok(hit.length > 0, `no ${f.code} in:\n${show(r.diagnostics)}`);
    assert.equal(hit[0].file, f.file, show(hit));
    if (f.line !== undefined) assert.equal(hit[0].line, f.line, show(hit));
    // The kit puts a did-you-mean in the message (B…) or in the tip, which the checker prints as the fix (L…).
    if (f.message) assert.match(`${hit[0].message} ${hit[0].fix}`, f.message);
    assert.ok(r.diagnostics.every((d) => d.fix.length > 0), `every diagnostic carries a fix:\n${show(r.diagnostics)}`);
  });
}

test("an example's top-level helper and constant resolve into its Program and lower: it checks clean", async () => {
  const r = await checkEdited([
    { file: EX1, from: IMPORT_LINE, to: `${IMPORT_LINE}\nconst WIDTH = 0.01;\nconst scale = (d) => d * WIDTH;` },
    { file: EX1, from: "const w = 0.01;", to: "const w = scale(1);" },
  ]);
  assert.equal(show(r.diagnostics), "");
});

test("a lowering error inside a top-level helper is placed at the helper's line", async () => {
  const r = await checkEdited([
    { file: EX1, from: IMPORT_LINE, to: `${IMPORT_LINE}\nconst scale = (d) => d.nope;` },
    { file: EX1, from: "const w = 0.01;", to: "const w = scale(1);" },
  ]);
  const hit = r.diagnostics.filter((d) => d.code === "L002");
  assert.ok(hit.length > 0, show(r.diagnostics));
  assert.deepEqual(hit.map((d) => [d.file, d.line]), [[EX1, 2]], show(hit));
});

test("two lambdas with the same text are each reported at their own line, and an own-file import stays allowed", async () => {
  const r = await checkEdited([
    { file: EX1, from: `.channel("late", (c, u) => c.pulse * 0.5)`, to: `.channel("late", (c, u) => c.nope)` },
    { file: EX1, from: `.channel("pulse", (c, u) => c.glow + c.base)`, to: `.channel("pulse", (c, u) => c.nope)` },
  ]);
  const lines = r.diagnostics.filter((d) => d.code === "L002").map((d) => d.line);
  assert.deepEqual(lines, [lineOf(EX1, `.channel("pulse"`), lineOf(EX1, `.channel("late"`)], show(r.diagnostics));
  assert.ok(!r.diagnostics.some((d) => d.code === "C006"), show(r.diagnostics));
});

test("a file's imports may be kit/define and the candidate's own files, and nothing else", async () => {
  const r = await checkEdited([], { "helper.js": `export const x = 1;\n`, "examples/04.js": `import { x } from "../helper.js";\nimport { program } from "../data.grammar.js";\nexport default ($) => program("h").pixel("(uv, u) => color(uv.x, 0, 0)");\n` });
  assert.equal(show(r.diagnostics), "");
});

test("a refused Dialect still has its Grammar checked, with no knock-on refusals, and every violation is collected", async () => {
  const r = await checkEdited([
    { file: DIALECT, from: "spell: { js: \"Math.floor($0)\"", to: "spel: { js: \"Math.floor($0)\"" },
    { file: GRAMMAR, from: `as: "params",`, to: `as: "params", optional: true,` },
    { file: DIALECT, from: "pure: true", to: "pure: false" },
  ]);
  const codes = r.diagnostics.map((d) => `${d.file} ${d.code}`);
  assert.ok(codes.includes(`${DIALECT} D001`) && codes.includes(`${GRAMMAR} D001`) && codes.includes(`${DIALECT} D012`), show(r.diagnostics));
  assert.ok(r.diagnostics.some((d) => /spel\b/.test(d.message)) && r.diagnostics.some((d) => /optional/.test(d.message)), show(r.diagnostics));
  assert.deepEqual(r.diagnostics.filter((d) => d.file === GRAMMAR).map((d) => d.code), ["D001"], "no D009 for the Dialect's conventions, no 'not a Dialect'");
  assert.ok(!r.diagnostics.some((d) => d.file.startsWith("examples/")), "examples are not run against refused definitions");
});

test("a Dialect with a syntax error is reported once, at its line, not again for the Grammar that imports it", async () => {
  const r = await checkEdited([{ file: DIALECT, from: `name: "tint",`, to: `name: "tint",,` }]);
  assert.deepEqual(r.diagnostics.map((d) => `${d.file}:${d.line} ${d.code}`), [`${DIALECT}:${lineOf(DIALECT, `name: "tint",`)} LOAD`], show(r.diagnostics));
});

test("a helper kit/define does not export is D011, with a did-you-mean", async () => {
  const r = await checkEdited([{ file: DIALECT, from: "exact, tolerance, enumOf, object }", to: "exact, tolerance, enumOf, object, vectr }" }]);
  const d = r.diagnostics.find((x) => x.code === "D011");
  assert.ok(d, show(r.diagnostics));
  assert.equal(d.file, DIALECT);
  assert.match(d.message, /vectr.*did you mean 'vector'/i);
});

test("a missing required key is refused, and a missing intrinsic signature is D004", async () => {
  const r = await checkEdited([
    { file: DIALECT, from: `  numberType: "f32",\n`, to: "" },
    { file: DIALECT, from: `params: ["f32"], returns: "f32", ref: Math.sin`, to: `ref: Math.sin` },
  ]);
  assert.ok(r.diagnostics.some((d) => d.code === "D001" && /numberType/.test(d.message)), show(r.diagnostics));
  assert.ok(r.diagnostics.some((d) => d.code === "D004" && /params/.test(d.message) && /returns/.test(d.message)), show(r.diagnostics));
});

test("D010 also refuses a parent that is not a construct", async () => {
  const r = await checkEdited([{ file: GRAMMAR, from: `parent: "tint"`, to: `parent: "tnt"` }]);
  assert.ok(r.diagnostics.some((d) => d.code === "D010" && /tnt/.test(d.message)), show(r.diagnostics));
});

test("an exported function that returns what .build() gives is B017 (its root opened), and a REFUSED file needs no Program", async () => {
  const r = await checkEdited([{ file: EX2, from: `color(uv.x, 0, 0)");`, to: `color(uv.x, 0, 0)").build();` }]);
  assert.deepEqual(r.diagnostics.map((d) => `${d.file} ${d.code}`), [`${EX2} B017`], show(r.diagnostics));
  assert.match(r.diagnostics[0].fix, /\.build\(\)/);
});

test("C001 refuses a bare builder chain: a Program is a function of its params, ($) => program(…)…", async () => {
  const r = await checkEdited([{ file: EX1, from: "export default ($) => program", to: "export default program" }]);
  assert.deepEqual(r.diagnostics.map((d) => `${d.file} ${d.code}`), [`${EX1} C001`], show(r.diagnostics));
  assert.match(r.diagnostics[0].fix, /export default \(\$\) => program/);
});

test("C001 refuses a function that does not take the params as its one parameter; another name for it is fine", async () => {
  for (const to of ["export default () => program", "export default ($, more) => program"]) {
    const r = await checkEdited([{ file: EX2, from: "export default ($) => program", to }]);
    assert.deepEqual(r.diagnostics.map((d) => `${d.file} ${d.code}`), [`${EX2} C001`], `${to}\n${show(r.diagnostics)}`);
    assert.match(r.diagnostics[0].message, /one parameter/);
    assert.match(r.diagnostics[0].fix, /export default \(\$\) => program/);
  }
  const ok = await checkEdited([{ file: EX2, from: "export default ($) => program", to: "export default (params) => program" }]);
  assert.equal(show(ok.diagnostics), "");
});

test("an example whose Program the builder refuses is not lowered", async () => {
  // B008 at .check(); the L002 in another lambda would only be found by lowering.
  const r = await checkEdited([
    { file: EX1, from: "const w = 0.01;", to: "const w = WIDTH;" },
    { file: EX1, from: "uv - vec2(HALF, HALF)", to: "uv - vec2(HALF, u.aspct)" },
  ]);
  assert.deepEqual(r.diagnostics.map((d) => d.code), ["B008"], show(r.diagnostics));
});

test("a lambda that does not parse is B007 with the parser's code; one outside the Runtime Subset is lowering's S code", async () => {
  const r = await checkEdited([{ file: EX2, from: "color(uv.x, 0, 0)", to: "color(uv.x, 0, 0" }]);
  const d = r.diagnostics.find((x) => x.code === "B007");
  assert.ok(d && /P\d{3}/.test(d.message), show(r.diagnostics));
  assert.equal(d.line, lineOf(EX2, ".pixel("));
  const s = await checkEdited([{ file: EX2, from: "color(uv.x, 0, 0)", to: "color(uv?.x, 0, 0)" }]);
  assert.deepEqual(s.diagnostics.map((x) => `${x.file}:${x.line} ${x.code}`), [`${EX2}:${lineOf(EX2, ".pixel(")} S105`]);
});

test("an example that throws while loading is reported, not crashed on", async () => {
  const r = await checkEdited([], { "examples/04.js": `import { program } from "../data.grammar.js";\nexport default program("x").pixel(undefinedThing);\n` });
  const d = r.diagnostics.find((x) => x.file === "examples/04.js");
  assert.ok(d && d.code === "C001" && /undefinedThing/.test(d.message), show(r.diagnostics));
});

test("the CLI prints each diagnostic with a fix line, exits 1, and logs one JSON line", () => {
  const f = /** @type {(typeof FAILING)[number]} */ (FAILING.find((x) => x.code === "B001"));
  const dir = fixture(f.edits);
  const log = join(dir, "log.jsonl");
  try {
    const r = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: log } });
    assert.equal(r.status, 1, r.stderr);
    const lines = r.stdout.trimEnd().split("\n");
    assert.match(lines[0], new RegExp(`^${join(dir, EX1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${f.line}: B001 `));
    assert.match(lines[1], /^ {2}fix: /);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    assert.equal(entry.ok, false);
    assert.equal(entry.dir, dir);
    assert.ok(typeof entry.time === "string" && entry.diagnostics.some((/** @type {{ code: string }} */ d) => d.code === "B001"));
    assert.match(entry.files[EX1], /\.mut\(/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI's --json prints the library's result", () => {
  const r = spawnSync(process.execPath, [CLI, VALID, "--json"], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: "" } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.deepEqual(out.diagnostics, []);
  assert.ok(EX1 in out.files);
});

test("the CLI exits 0 on the passing fixture, 2 on a bad invocation, 4 on a missing directory", () => {
  const ok = spawnSync(process.execPath, [CLI, VALID], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: "" } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /no violations/);
  const usage = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /usage: node .*check\.js <dir>/);
  const missing = join(tmpdir(), "define-trial-does-not-exist");
  assert.ok(!existsSync(missing));
  const gone = spawnSync(process.execPath, [CLI, missing], { encoding: "utf8" });
  assert.equal(gone.status, 4);
  assert.match(gone.stdout + gone.stderr, /data\.dialect\.js/);
});

test("a check that gives a tip and a fix prints the fix on the fix line and the tip on its own line", async () => {
  const dir = fixture([
    { file: GRAMMAR, from: `{ arg: 1, tip: "lower the value or raise max" }`, to: `{ arg: 1, tip: "lower the value or raise max", fix: "{ value: 8 }" }` },
    { file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: 9, min: 0, max: 8 }" },
  ]);
  try {
    const r = await checkDir(dir);
    const d = r.diagnostics.find((x) => x.code === "T001");
    assert.ok(d, show(r.diagnostics));
    assert.equal(d.fix, "write { value: 8 }");
    assert.equal(d.tip, "lower the value or raise max");
    const out = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" }).stdout;
    assert.match(out, /\n {2}fix: write \{ value: 8 \}\n {2}tip: lower the value or raise max\n/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a missing definition file for --lang budget names budget's files without attributing them to rules.md", async () => {
  const dir = fixture([]);
  try {
    await assert.rejects(checkDir(dir, { lang: "budget" }), (/** @type {any} */ e) => {
      assert.match(e.message, /budget\.dialect\.js does not exist; the check needs budget\.dialect\.js and budget\.grammar\.js/);
      assert.doesNotMatch(e.message, /rules\.md/);
      return true;
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a check that gives only a tip still prints it as the fix, with no tip line", async () => {
  const r = await checkEdited([{ file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: 9, min: 0, max: 8 }" }]);
  const d = r.diagnostics.find((x) => x.code === "T001");
  assert.ok(d, show(r.diagnostics));
  assert.equal(d.fix, "lower the value or raise max");
  assert.equal(d.tip, undefined);
});

// H5 (2026-11-25): agents read START.md and API.md, not api-draft.md, so no fallback line may send them there.
test("a check that gives neither tip nor fix prints a true fix line that names no document the reader may lack", async () => {
  const r = await checkEdited([
    { file: GRAMMAR, from: `{ arg: 1, tip: "lower the value or raise max" }`, to: `{ arg: 1 }` },
    { file: EX1, from: "{ value: 2, min: 0, max: 8 }", to: "{ value: 9, min: 0, max: 8 }" },
  ]);
  const d = r.diagnostics.find((x) => x.code === "T001");
  assert.ok(d, show(r.diagnostics));
  assert.doesNotMatch(d.fix, /api-draft|\.md/);
  assert.match(d.fix, /no fix/);
});

test("an import kit/define does not export names the exports without naming api-draft.md", async () => {
  const r = await checkEdited([{ file: DIALECT, from: "exact, tolerance, enumOf, object }", to: "exact, tolerance, enumOf, object, vectr }" }]);
  const d = r.diagnostics.find((x) => x.code === "D011");
  assert.ok(d, show(r.diagnostics));
  assert.doesNotMatch(d.fix, /api-draft/);
  assert.match(d.fix, /defineDialect/);
});
