// The Definition API trial's checker: the passing fixture checks clean, each code has a fixture that
// trips it (a one-edit mutation of the passing fixture, in a temp directory), and the CLI prints, exits
// and logs as rules.md and the README say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDir, CHECK_CODES } from "../checker/index.js";

/** @import { CheckDiagnostic } from "../checker/index.js" */

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "valid");
const CLI = join(HERE, "..", "check.js");
const DIALECT = "data.dialect.js", GRAMMAR = "data.grammar.js", EX1 = "examples/01.js";

/**
 * A copy of the passing fixture with each edit applied (`from` must occur exactly once).
 * @param {Array<{ file: string, from: string, to: string }>} edits
 * @param {Record<string, string>} [extra] files to add, by path
 */
function fixture(edits, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-"));
  cpSync(VALID, dir, { recursive: true });
  for (const e of edits) {
    const path = join(dir, e.file), src = readFileSync(path, "utf8");
    assert.equal(src.split(e.from).length, 2, `fixture edit: '${e.from}' must occur once in ${e.file}`);
    writeFileSync(path, src.replace(e.from, e.to));
  }
  for (const [file, text] of Object.entries(extra)) writeFileSync(join(dir, file), text);
  return dir;
}

/** @param {CheckDiagnostic[]} ds */
const show = (ds) => ds.map((d) => `${d.file}:${d.line}: ${d.code} ${d.message}`).join("\n");

/**
 * The line (1-based) of the first line of `file` in the passing fixture that contains `needle`.
 * @param {string} file @param {string} needle
 */
const lineOf = (file, needle) => readFileSync(join(VALID, file), "utf8").split("\n").findIndex((l) => l.includes(needle)) + 1;

/**
 * One failing fixture per code: the edits, and where the diagnostic must point.
 * @type {Record<string, { edits: Array<{ file: string, from: string, to: string }>, extra?: Record<string, string>, file: string, line?: number, message?: RegExp }>}
 */
const FAILING = {
  D001: { edits: [{ file: DIALECT, from: "  intrinsics: {", to: "  intrinsic: {" }], file: DIALECT, line: lineOf(DIALECT, "  intrinsics: {"), message: /intrinsic.*did you mean 'intrinsics'/i },
  D002: { edits: [{ file: DIALECT, from: `returns: "color", space`, to: `returns: "colour", space` }], file: DIALECT, line: lineOf(DIALECT, "slots: { pixel:"), message: /colour/ },
  D003: { edits: [{ file: DIALECT, from: `spell: { js: "Math.sin($0)", glsl: "sin($0)" }`, to: `spell: { js: "Math.sin($0)" }` }], file: DIALECT, line: lineOf(DIALECT, "sin: {"), message: /sin.*glsl/ },
  D004: { edits: [{ file: DIALECT, from: "ref: Math.sin, ", to: "" }], file: DIALECT, line: lineOf(DIALECT, "sin: {"), message: /sin.*ref/ },
  D005: { edits: [{ file: DIALECT, from: `space: "pixel" }`, to: `space: "pixels" }` }], file: DIALECT, line: lineOf(DIALECT, "slots: { pixel:"), message: /pixels/ },
  D006: { edits: [{ file: DIALECT, from: `accepts: ["pixel"]`, to: `accepts: ["pixel", "row"]` }], file: DIALECT, line: lineOf(DIALECT, `glsl: { accepts`), message: /row/ },
  D007: { edits: [{ file: DIALECT, from: "    HALF: { const", to: "    sin: { const" }], file: DIALECT, message: /sin/ },
  D008: { edits: [{ file: DIALECT, from: "tolerance(1e-3)", to: "tolerance(0)" }], file: DIALECT, line: lineOf(DIALECT, `glsl: { accepts`) },
  D009: { edits: [{ file: GRAMMAR, from: `slot: "pixel", once: true }`, to: `slot: "blend", once: true }` }], file: GRAMMAR, line: lineOf(GRAMMAR, "blend: {"), message: /blend/ },
  D010: { edits: [{ file: GRAMMAR, from: "blend: { kind", to: "pixel: { kind" }], file: GRAMMAR, message: /pixel/ },
  D011: { edits: [{ file: GRAMMAR, from: `data("string")`, to: `data("text")` }], file: GRAMMAR, line: lineOf(GRAMMAR, "tags: {"), message: /text/ },
  D012: { edits: [{ file: DIALECT, from: "pure: true", to: "pure: false" }], file: DIALECT, line: lineOf(DIALECT, "spaces: {") },
  D013: { edits: [{ file: DIALECT, from: `"(x, n) => x - n * floor(x / n)"`, to: `"(x, n) => x - n * floor(x / n"` }], file: DIALECT, line: lineOf(DIALECT, "pmod:"), message: /pmod.*P001/ },
  D014: { edits: [{ file: GRAMMAR, from: `kind: "decl", args: [rest`, to: `kind: "list", args: [rest` }], file: GRAMMAR, line: lineOf(GRAMMAR, "tags: {"), message: /list/ },
  C001: { edits: [{ file: EX1, from: "export default program", to: "const p = program" }], file: EX1, line: 1 },
  C002: { edits: [{ file: EX1, from: "const w = 0.01;", to: "const w = `0.01`;" }], file: EX1, line: lineOf(EX1, "const w = 0.01;"), message: /S104/ },
  C003: { edits: [{ file: EX1, from: "const w = 0.01;", to: "const w = WIDTH;" }], file: EX1, line: lineOf(EX1, "const w = 0.01;"), message: /WIDTH/ },
  C004: { edits: [{ file: EX1, from: ".blend(", to: ".blnd(" }], file: EX1, line: lineOf(EX1, ".blend("), message: /blnd.*did you mean 'blend'/i },
};

test("the passing fixture checks clean", async () => {
  const r = await checkDir(VALID);
  assert.equal(show(r.diagnostics), "");
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.files).sort(), [DIALECT, GRAMMAR, EX1, "examples/02.js", "examples/03.js"].sort());
});

test("every code has a failing fixture", () => {
  assert.deepEqual(Object.keys(FAILING).sort(), Object.keys(CHECK_CODES).sort());
});

for (const [code, f] of Object.entries(FAILING)) {
  test(`${code}: ${CHECK_CODES[/** @type {keyof typeof CHECK_CODES} */ (code)] ?? "(no such code)"}`, async () => {
    const dir = fixture(f.edits, f.extra);
    try {
      const r = await checkDir(dir);
      assert.equal(r.ok, false);
      const hit = r.diagnostics.filter((d) => d.code === code);
      assert.ok(hit.length > 0, `no ${code} in:\n${show(r.diagnostics)}`);
      assert.equal(hit[0].file, f.file);
      if (f.line !== undefined) assert.equal(hit[0].line, f.line, show(hit));
      if (f.message) assert.match(hit[0].message, f.message);
      assert.ok(hit.every((d) => d.fix.length > 0), `every ${code} carries a fix`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("D001 reaches every level, and the checker collects every violation rather than stopping", async () => {
  const dir = fixture([
    { file: DIALECT, from: "spell: { js: \"Math.floor($0)\"", to: "spel: { js: \"Math.floor($0)\"" },
    { file: GRAMMAR, from: `as: "params" }`, to: `as: "params", optional: true }` },
    { file: DIALECT, from: "pure: true", to: "pure: false" },
  ]);
  try {
    const r = await checkDir(dir);
    const codes = r.diagnostics.map((d) => `${d.file} ${d.code}`);
    assert.ok(codes.includes(`${DIALECT} D001`) && codes.includes(`${GRAMMAR} D001`) && codes.includes(`${DIALECT} D012`), show(r.diagnostics));
    assert.ok(r.diagnostics.some((d) => /spel\b/.test(d.message)) && r.diagnostics.some((d) => /optional/.test(d.message)), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a helper kit/define does not export is D011, with a did-you-mean", async () => {
  const dir = fixture([{ file: DIALECT, from: "exact, tolerance, enumOf }", to: "exact, tolerance, enumOf, vectr }" }]);
  try {
    const r = await checkDir(dir);
    const d = r.diagnostics.find((x) => x.code === "D011");
    assert.ok(d, show(r.diagnostics));
    assert.equal(d.file, DIALECT);
    assert.match(d.message, /vectr.*did you mean 'vector'/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a missing required key is refused, and a missing intrinsic signature is D004", async () => {
  const dir = fixture([
    { file: DIALECT, from: `  numberType: "f32",\n`, to: "" },
    { file: DIALECT, from: `params: ["f32"], returns: "f32", ref: Math.sin`, to: `ref: Math.sin` },
  ]);
  try {
    const r = await checkDir(dir);
    assert.ok(r.diagnostics.some((d) => d.code === "D001" && /numberType/.test(d.message)), show(r.diagnostics));
    assert.ok(r.diagnostics.some((d) => d.code === "D004" && /params/.test(d.message) && /returns/.test(d.message)), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("D010 also refuses a parent that is not a construct", async () => {
  const dir = fixture([{ file: GRAMMAR, from: `parent: "tint"`, to: `parent: "tnt"` }]);
  try {
    const r = await checkDir(dir);
    assert.ok(r.diagnostics.some((d) => d.code === "D010" && /tnt/.test(d.message)), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("D011 refuses data() with no shape", async () => {
  const dir = fixture([{ file: GRAMMAR, from: "data(ParamShape)", to: "data()" }]);
  try {
    const r = await checkDir(dir);
    assert.ok(r.diagnostics.some((d) => d.code === "D011" && d.line === lineOf(GRAMMAR, "param: {")), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C001 refuses an exported .build(), and a REFUSED file needs no Program", async () => {
  const dir = fixture([{ file: EX1, from: "ring(pmod(p.x, 1), RING));\n    }\n    return c;\n  });", to: "ring(pmod(p.x, 1), RING));\n    }\n    return c;\n  }).build();" }]);
  try {
    const r = await checkDir(dir);
    assert.deepEqual(r.diagnostics.map((d) => `${d.file} ${d.code}`), [`${EX1} C001`], show(r.diagnostics));
    assert.match(r.diagnostics[0].fix, /\.build\(\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C003 allows only the free-name rule's names", async () => {
  // `$` is declared in the fixture; take it away and its use is refused. A name local to an inner block
  // is not visible after it, and a property key or member name is not a free name.
  const dir = fixture([
    { file: DIALECT, from: `globals: { $: "Params" },`, to: "" },
    { file: EX1, from: "    return c;", to: "    const o = { k: c.x, i };\n    return c;" },
  ]);
  try {
    const r = await checkDir(dir);
    const c3 = r.diagnostics.filter((d) => d.code === "C003").map((d) => d.message);
    assert.equal(c3.length, 2, show(r.diagnostics));
    assert.ok(c3.some((m) => /'\$'/.test(m)) && c3.some((m) => /'i'/.test(m)), c3.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a C003 caused by a misspelled Dialect key points at the D001, and a one-letter name gets no did-you-mean", async () => {
  const dir = fixture([
    { file: DIALECT, from: "  intrinsics: {", to: "  intrinsic: {" },
    { file: "examples/02.js", from: `"(uv, u) => color(uv.x, 0, 0)"`, to: `"(uv, u) => color(uv.x, K, 0)"` },
  ]);
  try {
    const r = await checkDir(dir);
    const c3 = r.diagnostics.filter((d) => d.code === "C003");
    const mix = c3.find((d) => /'mix'/.test(d.message));
    assert.ok(mix && /under 'intrinsic'.*D001/.test(mix.message), show(r.diagnostics));
    const k = c3.find((d) => /'K'/.test(d.message));
    assert.ok(k && !/did you mean/i.test(k.message), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("C002 checks lambdas given as source text too, at the line inside the lambda", async () => {
  const dir = fixture([{ file: "examples/02.js", from: `"(uv, u) => color(uv.x, 0, 0)"`, to: `"(uv, u) => color(uv?.x, 0, 0)"` }]);
  try {
    const r = await checkDir(dir);
    const d = r.diagnostics.find((x) => x.code === "C002");
    assert.ok(d && /S105/.test(d.message), show(r.diagnostics));
    assert.equal(d.file, "examples/02.js");
    assert.equal(d.line, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an example that throws while loading is reported, not crashed on", async () => {
  const dir = fixture([], { "examples/04.js": `import { program } from "../data.grammar.js";\nexport default program("x").pixel(undefinedThing);\n` });
  try {
    const r = await checkDir(dir);
    const d = r.diagnostics.find((x) => x.file === "examples/04.js");
    assert.ok(d && d.code === "C001" && /undefinedThing/.test(d.message), show(r.diagnostics));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI prints each diagnostic with a fix line, exits 1, and logs one JSON line", () => {
  const dir = fixture(FAILING.C004.edits);
  const log = join(dir, "log.jsonl");
  try {
    const r = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8", env: { ...process.env, DEFINE_TRIAL_LOG: log } });
    assert.equal(r.status, 1, r.stderr);
    const lines = r.stdout.trimEnd().split("\n");
    assert.match(lines[0], new RegExp(`^${join(dir, EX1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:${FAILING.C004.line}: C004 `));
    assert.match(lines[1], /^ {2}fix: /);
    const entry = JSON.parse(readFileSync(log, "utf8").trim());
    assert.equal(entry.ok, false);
    assert.equal(entry.dir, dir);
    assert.ok(typeof entry.time === "string" && entry.diagnostics.some((/** @type {{ code: string }} */ d) => d.code === "C004"));
    assert.match(entry.files[EX1], /\.blnd\(/);
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
