// The checker on per-slot effects (docs/api-effects.md), which kit/define now checks itself, and the --effects mode,
// which holds an example marked // REFUSED: <code> to failing. The garden fixture checks clean; each code (D012
// widened, every D021 and D022 case, L004, L013, L017, C008) has a fixture that trips it, a small edit of the garden
// in a temp directory, at the right file and line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir, EFFECTS_CODES } from "../checker/index.js";

/** @import { CheckDiagnostic } from "../checker/index.js" */

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "effects-valid");
const CLI = join(HERE, "..", "check.js");
const DIALECT = "garden.dialect.js", EX1 = "examples/01.js", R01 = "examples/r01.js";
const OPTIONS = { lang: "garden", effects: true };

/** @typedef {{ file: string, from: string, to: string }} Edit */

/** @param {Edit[]} edits @param {Record<string, string>} [extra] */
function fixture(edits, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-effects-"));
  cpSync(VALID, dir, { recursive: true });
  for (const e of edits) {
    const path = join(dir, e.file), src = readFileSync(path, "utf8");
    assert.equal(src.split(e.from).length, 2, `fixture edit: '${e.from}' must occur once in ${e.file}`);
    writeFileSync(path, src.replace(e.from, e.to));
  }
  for (const [file, text] of Object.entries(extra)) writeFileSync(join(dir, file), text);
  return dir;
}

/** @param {Edit[]} edits @param {Record<string, string>} [extra] @param {{ lang?: string, effects?: boolean }} [options] */
async function checkEdited(edits, extra, options = OPTIONS) {
  const dir = fixture(edits, extra);
  try { return await checkDir(dir, options); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** @param {CheckDiagnostic[]} ds */
const show = (ds) => ds.map((d) => `${d.file}:${d.line}: ${d.code} [${d.severity}] ${d.message}`).join("\n");
/** @param {CheckDiagnostic[]} ds */
const errors = (ds) => ds.filter((d) => d.severity === "error");

/** @param {string} file @param {string} needle */
function lineOf(file, needle) {
  const n = readFileSync(join(VALID, file), "utf8").split("\n").findIndex((l) => l.includes(needle)) + 1;
  assert.ok(n > 0, `'${needle}' is not in ${file}`);
  return n;
}

const GROW_MAY = `may: ["write Plant", "destroy Plant", "bump Totals"]`;
const SOW_PARAMS = `params: ["Plant", "Rng"]`;
const RAIN = `rain: { params: ["f64"], returns: "f64", space: "weather", may: ["read Totals"] }`;
const PLANT_AGE = `      age: "f64",\n`;
const GROW_BODY = "    totals.grown++;\n";

/**
 * One failing fixture per case of each new code: the edits, and where the diagnostic must point.
 * @type {Array<{ code: string, why: string, edits: Edit[], extra?: Record<string, string>, file: string, line?: number, message?: RegExp }>}
 */
const FAILING = [
  // D012, widened: exactly one of pure: true or instance.
  { code: "D012", why: "both pure and instance", edits: [{ file: DIALECT, from: `plant: { instance: "Plant" }`, to: `plant: { pure: true, instance: "Plant" }` }], file: DIALECT, line: lineOf(DIALECT, "plant: { instance"), message: /plant.*both|one of/i },
  { code: "D012", why: "neither", edits: [{ file: DIALECT, from: `plant: { instance: "Plant" }`, to: `plant: {}` }], file: DIALECT, line: lineOf(DIALECT, "plant: { instance"), message: /plant.*instance/ },
  { code: "D012", why: "pure: false", edits: [{ file: DIALECT, from: `weather: { pure: true }`, to: `weather: { pure: false }` }], file: DIALECT, line: lineOf(DIALECT, "weather: {"), message: /weather.*instance/ },
  // D021: a malformed effect declaration.
  { code: "D021", why: "an unknown verb in may", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["writ Plant", "destroy Plant", "bump Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /writ.*did you mean 'write'/i },
  { code: "D021", why: "an unknown object in may", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plnt", "destroy Plant", "bump Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /Plnt.*did you mean 'Plant'/i },
  { code: "D021", why: "an unknown member in may", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plant.hight", "destroy Plant", "bump Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /hight.*did you mean 'height'/i },
  { code: "D021", why: "a non-read in a pure space's slot", edits: [{ file: DIALECT, from: `space: "weather", may: ["read Totals"]`, to: `space: "weather", may: ["rng"]` }], file: DIALECT, line: lineOf(DIALECT, "rain: {"), message: /rng.*pure/i },
  { code: "D021", why: "a bump outside an instance space", edits: [{ file: DIALECT, from: `space: "weather", may: ["read Totals"]`, to: `space: "weather", may: ["bump Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "rain: {"), message: /bump/ },
  { code: "D021", why: "a non-read in helpers", edits: [{ file: DIALECT, from: `helpers: { may: ["read Plant"] }`, to: `helpers: { may: ["write Plant"] }` }], file: DIALECT, line: lineOf(DIALECT, "helpers: {"), message: /helper.*read/i },
  { code: "D021", why: "a key in helpers other than may", edits: [{ file: DIALECT, from: `helpers: { may: ["read Plant"] }`, to: `helpers: { may: ["read Plant"], can: [] }` }], file: DIALECT, line: lineOf(DIALECT, "helpers: {"), message: /can/ },
  { code: "D021", why: "a bump of a member that is not a total", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plant", "destroy Plant", "bump Plant.height"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /height.*total/i },
  { code: "D021", why: "a write of a member that is not writable", edits: [{ file: DIALECT, from: `may: ["write Plant.water", "write Plant.spot", "rng"]`, to: `may: ["write Plant.age", "write Plant.spot", "rng"]` }], file: DIALECT, line: lineOf(DIALECT, "sow: {"), message: /age.*writable/i },
  { code: "D021", why: "one slot that may read and bump one total", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plant", "destroy Plant", "bump Totals", "read Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /read.*bump|bump.*read/i },
  { code: "D021", why: "write and bump on one member", edits: [{ file: DIALECT, from: `height: { value: "f64", write: true }`, to: `height: { value: "f64", write: true, bump: true }` }], file: DIALECT, line: lineOf(DIALECT, "height: {"), message: /height/ },
  { code: "D021", why: "write on a member that is not a value", edits: [{ file: DIALECT, from: `returns: "void" }, effects: ["destroy Plant"]`, to: `returns: "void" }, write: true, effects: ["destroy Plant"]` }], file: DIALECT, line: lineOf(DIALECT, "wilt: {"), message: /wilt.*value/i },
  { code: "D021", why: "effects on an intrinsic", edits: [{ file: DIALECT, from: `  targets: {`, to: `  intrinsics: { noise: { params: ["f64"], returns: "f64", ref: (x) => x, spell: { js: "($0)" }, effects: ["rng"] } },\n  targets: {` }], file: DIALECT, message: /noise.*pure|intrinsic/i },
  { code: "D021", why: "an unknown verb in a verb's effects", edits: [{ file: DIALECT, from: `effects: ["destroy Plant"] }`, to: `effects: ["destry Plant"] }` }], file: DIALECT, line: lineOf(DIALECT, "wilt: {"), message: /destry/ },
  // D022: an instance reachable another way, or a change outside its instance space.
  { code: "D022", why: "a member of the instance's type", edits: [{ file: DIALECT, from: PLANT_AGE, to: `${PLANT_AGE}      neighbor: "Plant",\n` }], file: DIALECT, message: /neighbor/ },
  { code: "D022", why: "a method result of the instance's type", edits: [{ file: DIALECT, from: PLANT_AGE, to: `${PLANT_AGE}      next: { fn: { params: [], returns: "Plant" } },\n` }], file: DIALECT, message: /next/ },
  { code: "D022", why: "a global of the instance's type", edits: [{ file: DIALECT, from: `globals: { totals: "Totals"`, to: `globals: { first: "Plant", totals: "Totals"` }], file: DIALECT, line: lineOf(DIALECT, "globals: {"), message: /first/ },
  { code: "D022", why: "a list item of the instance's type", edits: [{ file: DIALECT, from: `import { defineDialect, vector, exact }`, to: `import { defineDialect, vector, exact, list }` }, { file: DIALECT, from: PLANT_AGE, to: `${PLANT_AGE}      kin: list("Plant", 4),\n` }], file: DIALECT, message: /kin/ },
  { code: "D022", why: "a struct field of the instance's type", edits: [{ file: DIALECT, from: `import { defineDialect, vector, exact }`, to: `import { defineDialect, vector, exact, struct }` }, { file: DIALECT, from: `globals: { totals: "Totals"`, to: `globals: { pair: struct({ a: "Plant", b: "f64" }), totals: "Totals"` }], file: DIALECT, message: /pair/ },
  { code: "D022", why: "an intrinsic result of the instance's type", edits: [{ file: DIALECT, from: `  targets: {`, to: `  intrinsics: { pick: { params: ["f64"], returns: "Plant", ref: (x) => x, spell: { js: "($0)" } } },\n  targets: {` }], file: DIALECT, message: /pick/ },
  { code: "D022", why: "an object's call result of the instance's type", edits: [{ file: DIALECT, from: `call: { params: [], returns: "f64" }`, to: `call: { params: [], returns: "Plant" }` }], file: DIALECT, line: lineOf(DIALECT, "Rng: {"), message: /Rng/ },
  { code: "D022", why: "a slot outside the instance space that takes one", edits: [{ file: DIALECT, from: RAIN, to: `rain: { params: ["f64", "Plant"], returns: "f64", space: "weather", may: ["read Totals"] }` }], file: DIALECT, line: lineOf(DIALECT, "rain: {"), message: /rain.*Plant/ },
  { code: "D022", why: "a slot in the instance space that takes none", edits: [{ file: DIALECT, from: SOW_PARAMS, to: `params: ["Rng"]` }], file: DIALECT, line: lineOf(DIALECT, "sow: {"), message: /sow.*Plant/ },
  { code: "D022", why: "a slot in the instance space that takes two", edits: [{ file: DIALECT, from: SOW_PARAMS, to: `params: ["Plant", "Plant"]` }], file: DIALECT, line: lineOf(DIALECT, "sow: {"), message: /sow.*Plant/ },
  { code: "D022", why: "a write of an object outside its instance space", edits: [{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plant", "destroy Plant", "bump Totals", "write Totals"]` }], file: DIALECT, line: lineOf(DIALECT, "grow: {"), message: /Totals/ },
  // L004: an effect the slot's may does not allow.
  { code: "L004", why: "the lambda's own write", edits: [{ file: EX1, from: "    pl.water = rng();\n", to: "    pl.water = rng();\n    pl.height = 0;\n" }], file: EX1, line: lineOf(EX1, "pl.water = rng();") + 1, message: /sow may not 'write Plant\.height'.*write Plant\.water/s },
  { code: "L004", why: "a verb the slot may not call", edits: [{ file: EX1, from: "    pl.water = rng();\n", to: "    pl.water = rng();\n    pl.wilt();\n" }], file: EX1, line: lineOf(EX1, "pl.water = rng();") + 1, message: /destroy Plant/ },
  { code: "L004", why: "a read of a total the slot may not read", edits: [{ file: EX1, from: "    pl.water = rng();\n", to: "    pl.water = rng() + totals.grown;\n" }], file: EX1, line: lineOf(EX1, "pl.water = rng();"), message: /read Totals\.grown/ },
  { code: "L004", why: "a bump the slot may not make", edits: [{ file: EX1, from: "    pl.water = rng();\n", to: "    pl.water = rng();\n    totals.grown++;\n" }], file: EX1, line: lineOf(EX1, "pl.water = rng();") + 1, message: /bump Totals\.grown/ },
  { code: "L004", why: "a helper's effect beyond helpers.may, at the helper", edits: [{ file: EX1, from: "const tall = (pl) => pl.height > TALL;", to: "const tall = (pl) => { pl.wilt(); return pl.height > TALL; };" }], file: EX1, line: lineOf(EX1, "const tall"), message: /destroy Plant/ },
  { code: "L004", why: "a helper reading a total helpers.may does not list", edits: [{ file: EX1, from: "const tall = (pl) => pl.height > TALL;", to: "const tall = (pl) => pl.height > totals.grown;" }], file: EX1, line: lineOf(EX1, "const tall"), message: /read Totals\.grown/ },
  // L017: a total changed other than by a bump statement.
  { code: "L017", why: "an assignment", edits: [{ file: EX1, from: GROW_BODY, to: "    totals.grown = 0;\n" }], file: EX1, line: lineOf(EX1, "totals.grown++"), message: /grown/ },
  { code: "L017", why: "-=", edits: [{ file: EX1, from: GROW_BODY, to: "    totals.grown -= 1;\n" }], file: EX1, line: lineOf(EX1, "totals.grown++"), message: /grown/ },
  { code: "L017", why: "--", edits: [{ file: EX1, from: GROW_BODY, to: "    totals.grown--;\n" }], file: EX1, line: lineOf(EX1, "totals.grown++"), message: /grown/ },
  { code: "L017", why: "a bump used as a value", edits: [{ file: EX1, from: GROW_BODY, to: "    pl.water = totals.grown++;\n" }], file: EX1, line: lineOf(EX1, "totals.grown++"), message: /grown/ },
  { code: "L017", why: "a read of a total in a slot that may bump it", edits: [{ file: EX1, from: GROW_BODY, to: "    if (totals.grown > 3) { pl.water = 0; }\n" }], file: EX1, line: lineOf(EX1, "totals.grown++"), message: /grown/ },
  // C008: a refusal that builds clean.
  { code: "C008", why: "a refusal with its mistake removed", edits: [{ file: R01, from: "    pl.height = 1;\n", to: "" }], file: R01, line: 1, message: /REFUSED/ },
];

test("the garden fixture checks clean in --effects mode, its refusal reported beside its declared code", async () => {
  const r = await checkDir(VALID, OPTIONS);
  assert.equal(show(errors(r.diagnostics)), "");
  assert.equal(r.ok, true);
  const refused = r.diagnostics.filter((d) => d.file === R01);
  assert.ok(refused.length > 0 && refused.every((d) => d.severity === "info"), show(r.diagnostics));
  assert.ok(refused.some((d) => /declared L004/.test(d.message) && /L004/.test(d.message.replace(/declared L004/, ""))), show(refused));
});

// Changed in 8vQJOw: the kit now has per-slot effects, so without --effects the garden's definitions are accepted
// (they were D012 and D001 before); what fails is its refusal, which only --effects expects to fail.
test("without --effects the garden's definitions are accepted, and its refusal is an ordinary violation", async () => {
  const r = await checkDir(VALID, { lang: "garden" });
  assert.equal(r.ok, false);
  assert.deepEqual(errors(r.diagnostics).map((d) => `${d.file} ${d.code}`), [`${R01} L004`], show(r.diagnostics));
});

test("every new code has a failing fixture", () => {
  const covered = new Set(FAILING.map((f) => f.code));
  for (const code of ["D012", "D021", "D022", "L004", "L017", ...Object.keys(EFFECTS_CODES)]) assert.ok(covered.has(code), `no failing fixture for ${code}`);
  assert.ok("C008" in EFFECTS_CODES);
});

for (const f of FAILING) {
  test(`${f.code} (${f.why})`, async () => {
    const r = await checkEdited(f.edits, f.extra);
    assert.equal(r.ok, false, show(r.diagnostics));
    const hit = r.diagnostics.filter((d) => d.code === f.code && d.severity === "error");
    assert.ok(hit.length > 0, `no ${f.code} in:\n${show(r.diagnostics)}`);
    assert.equal(hit[0].file, f.file, show(hit));
    if (f.line !== undefined) assert.equal(hit[0].line, f.line, show(hit));
    if (f.message) assert.match(`${hit[0].message} ${hit[0].fix} ${hit[0].tip ?? ""}`, f.message);
    assert.ok(r.diagnostics.every((d) => d.fix.length > 0), `every diagnostic carries a fix:\n${show(r.diagnostics)}`);
  });
}

test("a write the real lowering refuses stays L013: a read-only member, and part of a vector member", async () => {
  for (const to of ["    pl.age = 1;\n", "    pl.spot.x = 1;\n"]) {
    const r = await checkEdited([{ file: EX1, from: GROW_BODY, to }]);
    assert.deepEqual(errors(r.diagnostics).map((d) => `${d.file}:${d.line} ${d.code}`), [`${EX1}:${lineOf(EX1, "totals.grown++")} L013`], `${to}\n${show(r.diagnostics)}`);
  }
});

test("a whole-vector write and a bump of any number expression lower clean, and a helper may read the plant it is passed", async () => {
  const r = await checkEdited([{ file: EX1, from: GROW_BODY, to: "    totals.grown += pl.height * 2;\n    pl.spot = pl.spot + vec2(1, 0);\n" }]);
  assert.equal(show(errors(r.diagnostics)), "");
});

test("a total declared by environment(program) is checked: a bump of a member that is no total is D021 when lowered", async () => {
  const r = await checkEdited([{ file: DIALECT, from: GROW_MAY, to: `may: ["write Plant", "destroy Plant", "bump Totals.harvst"]` }]);
  const d = r.diagnostics.find((x) => x.code === "D021");
  assert.ok(d, show(r.diagnostics));
  assert.equal(d.file, DIALECT);
  assert.match(d.message, /harvst.*did you mean 'harvest'/i);
  assert.match(d.message, /when examples\/01\.js was lowered/);
});

test("a refusal that fails for another reason than declared still passes; the codes it failed with are printed beside", async () => {
  const r = await checkEdited([{ file: R01, from: "    pl.height = 1;\n", to: "    pl.age = 1;\n" }]);
  assert.equal(show(errors(r.diagnostics)), "");
  const d = r.diagnostics.find((x) => x.file === R01 && x.code === "REFUSED");
  assert.ok(d, show(r.diagnostics));
  assert.match(d.message, /declared L004.*L013/);
});

test("a REFUSED file with no Program is C008: nothing was refused", async () => {
  const r = await checkEdited([], { "examples/r02.js": "// REFUSED: L004\n" });
  assert.ok(r.diagnostics.some((d) => d.file === "examples/r02.js" && d.code === "C008" && d.severity === "error"), show(r.diagnostics));
});

test("without --effects a REFUSED file needs no Program, as before", async () => {
  const r = await checkEdited([], { "examples/r02.js": "// REFUSED: L004\n" }, { lang: "garden" });
  assert.ok(!r.diagnostics.some((d) => d.file === "examples/r02.js"), show(r.diagnostics));
});

const NO_HELPERS = { file: DIALECT, from: `  helpers: { may: ["read Plant"] },\n`, to: "" };

test("with no helpers key, a helper reading a total is L004 at the helper: the default reads only instance objects", async () => {
  const r = await checkEdited([NO_HELPERS, { file: EX1, from: "const tall = (pl) => pl.height > TALL;", to: "const tall = (pl) => pl.height > totals.grown;" }]);
  const hit = r.diagnostics.filter((d) => d.code === "L004" && d.severity === "error");
  assert.ok(hit.length > 0, show(r.diagnostics));
  assert.equal(hit[0].file, EX1);
  assert.equal(hit[0].line, lineOf(EX1, "const tall"));
  // Changed in 8vQJOw: the kit's lowering words the helper's L004 ("may only read (read Plant)"), not the shim.
  assert.match(`${hit[0].message} ${hit[0].fix}`, /read Totals\.grown.*read Plant/s);
});

test("with no helpers key, a helper may still read the plant it is passed", async () => {
  const r = await checkEdited([NO_HELPERS]);
  assert.equal(show(errors(r.diagnostics)), "");
});

test("the CLI's --effects runs the mode, and prints the refusal line", () => {
  const r = spawnSync(process.execPath, [CLI, VALID, "--effects", "--lang", "garden"], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: "" } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /r01\.js:1: REFUSED declared L004/);
  assert.match(r.stdout, /no violations/);
  const without = spawnSync(process.execPath, [CLI, VALID, "--lang", "garden"], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: "" } });
  assert.equal(without.status, 1);
});
