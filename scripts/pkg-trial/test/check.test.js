// The package trial checker: both hand-made fixtures check clean, and each K code has a failing copy made from a
// fixture by a small edit. The CLI is driven as a binary for output, exit codes and the log.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPackageDir, CheckTargetError } from "../checker/index.js";
import { hashDir } from "../../pkg/dir.js";
import { PACKAGE_CODES } from "../../../kit/package/index.js";
import { UI_CODES } from "../../../kit/define/codes.js";
import { pngHeader } from "../../../kit/package/fixtures/png.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = join(HERE, "../fixtures/valid");
const CHECK = join(HERE, "../check.js");

/** Codes the cases below saw. @type {Set<string>} */
const seen = new Set();

/**
 * A copy of a fixture with `edit(dir)` applied, then re-hashed unless `stale`.
 * @param {"particles" | "maze"} name @param {(dir: string) => void | Promise<void>} [edit] @param {{ stale?: boolean }} [o]
 */
async function copy(name, edit = () => {}, { stale = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "GZby9I-pt-"));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  await edit(dir);
  if (!stale) await hashDir(dir);
  return dir;
}
/** @param {string} dir @param {string} file @param {string} from @param {string} to */
function sub(dir, file, from, to) {
  const t = readFileSync(join(dir, file), "utf8");
  assert.ok(t.includes(from), `fixture edit: '${from}' not in ${file}`);
  writeFileSync(join(dir, file), t.replace(from, () => to));
}
/** @param {string} dir @param {(m: any) => void} edit */
function manifest(dir, edit) {
  const m = JSON.parse(readFileSync(join(dir, "wb-package.json"), "utf8"));
  edit(m);
  writeFileSync(join(dir, "wb-package.json"), JSON.stringify(m, null, 2));
}
/** @param {"particles" | "maze"} name @param {(dir: string) => void | Promise<void>} edit @param {{ stale?: boolean }} [o] */
async function check(name, edit, o) {
  const dir = await copy(name, edit, o);
  try {
    const r = await checkPackageDir(dir);
    for (const d of r.diagnostics) seen.add(d.code);
    return r;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** @param {Awaited<ReturnType<typeof check>>} r */
const codes = (r) => r.diagnostics.map((d) => d.code);

for (const name of /** @type {const} */ (["particles", "maze"])) {
  test(`the ${name} fixture checks clean`, async () => {
    const r = await checkPackageDir(join(FIXTURES, name));
    assert.deepEqual(r.diagnostics, []);
    assert.equal(r.ok, true);
    assert.ok(r.files.includes("wb-package.json"));
  });
}

test("K001: no manifest", async () => {
  const r = await check("maze", (d) => rmSync(join(d, "wb-package.json")), { stale: true });
  assert.deepEqual(codes(r), ["K001"]);
});

test("K002: an unknown manifest key, with the manifest's file and a fix", async () => {
  const r = await check("maze", (d) => manifest(d, (m) => { m.dependencies = {}; }));
  assert.deepEqual(codes(r), ["K002"]);
  assert.equal(r.diagnostics[0].file, "wb-package.json");
  assert.ok(r.diagnostics[0].fix);
});

test("K003: the wrong kit version", async () => {
  const r = await check("maze", (d) => manifest(d, (m) => { m.kit = "0.3"; }));
  assert.deepEqual(codes(r), ["K003"]);
});

test("K004: a listed file removed", async () => {
  const r = await check("maze", (d) => rmSync(join(d, "examples/01.js")), { stale: true });
  assert.deepEqual(codes(r), ["K004"]);
  assert.equal(r.diagnostics[0].file, "examples/01.js");
});

test("K005: a file the manifest does not list", async () => {
  const r = await check("maze", (d) => { writeFileSync(join(d, "extra.js"), "export {};\n"); }, { stale: true });
  assert.deepEqual(codes(r), ["K005"]);
});

test("K006: a file edited after hashing", async () => {
  const r = await check("maze", (d) => writeFileSync(join(d, "examples/01.js"), "// changed\n" + readFileSync(join(d, "examples/01.js"), "utf8")), { stale: true });
  assert.deepEqual(codes(r), ["K006"]);
  assert.equal(r.diagnostics[0].file, "examples/01.js");
});

test("K007: a built-in import, with its file and line", async () => {
  const r = await check("maze", (d) => sub(d, "maze.dialect.js", `import { defineDialect`, `import { readFileSync } from "node:fs";\nimport { defineDialect`));
  assert.deepEqual(codes(r), ["K007"]);
  assert.equal(r.diagnostics[0].file, "maze.dialect.js");
  assert.equal(r.diagnostics[0].line, 1);
});

test("K007: a dynamic import() in a package file", async () => {
  const r = await check("maze", (d) => sub(d, "examples/01.js", "export default", "const later = () => import(\"./x.js\");\nexport default"));
  assert.deepEqual(codes(r), ["K007"]);
});

test("K008: a Dialect whose name is not the manifest's", async () => {
  const r = await check("maze", (d) => manifest(d, (m) => { m.name = "labyrinth"; }));
  assert.ok(codes(r).includes("K008"));
});

test("K008: a Grammar file that exports no builder", async () => {
  const r = await check("maze", (d) => sub(d, "maze.grammar.js", "export const maze =", "const maze ="));
  assert.ok(codes(r).includes("K008"), codes(r).join());
});

test("K009: modules that import each other cannot be uploaded", async () => {
  const r = await check("maze", (d) => {
    writeFileSync(join(d, "a.js"), `import "./b.js";\nexport const a = 1;\n`);
    writeFileSync(join(d, "b.js"), `import "./a.js";\nexport const b = 1;\n`);
    manifest(d, (m) => { m.lib = ["a.js", "b.js"]; });
  });
  assert.deepEqual(codes(r), ["K009"]);
});

test("K011: an entry that throws when it loads, with the file and line it threw at", async () => {
  const r = await check("maze", (d) => sub(d, "maze.dialect.js", "export const mazeDialect", "throw new Error(\"boom\");\nexport const mazeDialect"));
  assert.deepEqual(codes(r), ["K011"]);
  assert.equal(r.diagnostics[0].file, "maze.dialect.js");
  assert.match(r.diagnostics[0].message, /boom/);
  assert.equal(r.diagnostics[0].line, 5);
});

test("K012: an example the kit refuses when it builds it, naming the example and the first diagnostic", async () => {
  const r = await check("particles", (d) => cpSync(join(d, "refusals/r01.js"), join(d, "examples/01.js")));
  assert.deepEqual(codes(r), ["K012"]);
  assert.equal(r.diagnostics[0].file, "examples/01.js");
  assert.match(r.diagnostics[0].message, /L004/);
});

test("K012: an example whose default export is not a function of the params", async () => {
  const r = await check("maze", (d) => sub(d, "examples/01.js", "export default", "export const program ="));
  assert.deepEqual(codes(r), ["K012"]);
  assert.equal(r.diagnostics[0].file, "examples/01.js");
});

test("K011: an example that throws when it loads, with the file and line it threw at", async () => {
  const r = await check("maze", (d) => sub(d, "examples/01.js", "export default", "throw new Error(\"boom\");\nexport default"));
  assert.deepEqual(codes(r), ["K011"]);
  assert.equal(r.diagnostics[0].file, "examples/01.js");
  assert.match(r.diagnostics[0].message, /boom/);
  assert.ok(r.diagnostics[0].line > 1);
});

test("K013: a refusal that builds clean", async () => {
  const r = await check("particles", (d) => cpSync(join(d, "examples/01.js"), join(d, "refusals/r01.js")));
  assert.deepEqual(codes(r), ["K013"]);
  assert.equal(r.diagnostics[0].file, "refusals/r01.js");
  assert.match(r.diagnostics[0].message, /L004/);
});

test("K014: a refusal refused with another code, naming both", async () => {
  const r = await check("particles", (d) => manifest(d, (m) => { m.refusals[0].code = "L013"; }));
  assert.deepEqual(codes(r), ["K014"]);
  assert.match(r.diagnostics[0].message, /L013/);
  assert.match(r.diagnostics[0].message, /L004/);
});

test("K015: a UI element module the manifest's elements does not list", async () => {
  const r = await check("particles", (d) => manifest(d, (m) => { delete m.elements; }));
  assert.deepEqual(codes(r), ["K015"]);
  assert.match(r.diagnostics[0].message, /particles-field\.js/);
});

test("K016: an elements entry no UI element names", async () => {
  const r = await check("particles", (d) => manifest(d, (m) => { m.elements.push("examples/01.js"); }));
  assert.deepEqual(codes(r), ["K016"]);
  assert.match(r.diagnostics[0].message, /examples\/01\.js/);
});

// K017–K019: the data files a Dialect names (leaf hca0YM); kit/package/test/data.test.js has the rest
/** The maze fixture with a picture declared at `file`, of `size`, and the `png` bytes written there (none when null). @param {string} d @param {Uint8Array | null} png */
function withSheet(d, png) {
  sub(d, "maze.dialect.js", `  name: "maze",\n`, `  name: "maze",\n  images: { sheet: { size: [16, 8], cell: [8, 8], file: "art/sheet.png", note: "a wall, then the floor" } },\n`);
  if (png) { mkdirSync(join(d, "art")); writeFileSync(join(d, "art/sheet.png"), png); }
}
test("K017: an image file the Dialect names that the folder lacks", async () => {
  const r = await check("maze", (d) => withSheet(d, null));
  assert.deepEqual(codes(r), ["K017"]);
  assert.match(r.diagnostics[0].message, /images\.sheet names art\/sheet\.png/);
});
test("K018 and K019: a picture that is not a PNG, and one of another size", async () => {
  assert.deepEqual(codes(await check("maze", (d) => withSheet(d, new Uint8Array([0xff, 0xfe, 0, 1])))), ["K018"]);
  const r = await check("maze", (d) => withSheet(d, pngHeader(8, 8)));
  assert.deepEqual(codes(r), ["K019"]);
  assert.equal(r.diagnostics[0].file, "art/sheet.png");
  assert.deepEqual(codes(await check("maze", (d) => withSheet(d, pngHeader(16, 8)))), [], "the right size loads clean");
});

test("a dotfile in the folder is not part of the package", async () => {
  const r = await check("maze", (d) => { writeFileSync(join(d, ".DS_Store"), "junk"); mkdirSync(join(d, ".cache")); writeFileSync(join(d, ".cache/x.js"), 'import "node:fs";\n'); }, { stale: true });
  assert.deepEqual(r.diagnostics, []);
  assert.ok(!r.files.some((p) => p.includes(".DS_Store") || p.startsWith(".cache")));
});

test("the defineUI checks run on a package's UI: a bad path is a U005 with its line", async () => {
  const r = await check("maze", (d) => sub(d, "maze.ui.js", `value: "score"`, `value: "scoore"`));
  assert.ok(codes(r).includes("U005"), codes(r).join());
  assert.ok(!codes(r).includes("K008"), "the UI's refusal is not also a K008");
  assert.ok(r.diagnostics.every((d) => d.file === "maze.ui.js" && d.line > 1));
});

test("the UI check follows the manifest's entry names, not a naming convention", async () => {
  const r = await check("maze", (d) => {
    cpSync(join(d, "maze.ui.js"), join(d, "view.js"));
    rmSync(join(d, "maze.ui.js"));
    manifest(d, (m) => { m.entry.ui = "view.js"; });
    sub(d, "view.js", `value: "score"`, `value: "scoore"`);
  });
  assert.ok(codes(r).includes("U005"));
  assert.ok(r.diagnostics.some((x) => x.file === "view.js"));
});

test("every K code a folder can show is exercised above (K010 is the bundle's, K020 and K021 the manifest tests', in kit/package's tests)", () => {
  for (const c of Object.keys(PACKAGE_CODES)) if (!["K010", "K020", "K021"].includes(c)) assert.ok(seen.has(c), `${c} not seen`);
  assert.ok(Object.keys(UI_CODES).length > 0);
});

test("a missing directory is a CheckTargetError", async () => {
  await assert.rejects(checkPackageDir(join(tmpdir(), "GZby9I-nope")), CheckTargetError);
});

// --- the CLI ---

/** @param {string[]} args @param {Record<string, string>} [env] */
const cli = (args, env = {}) => spawnSync("node", [CHECK, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("CLI: a clean fixture prints no violations and exits 0", () => {
  const r = cli([join(FIXTURES, "maze")]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /no violations/);
});

test("CLI: violations print as file:line: code message, then a fix line; exit 1", async () => {
  const dir = await copy("maze", (d) => manifest(d, (m) => { m.kit = "0.3"; }));
  try {
    const r = cli([dir]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/wb-package\\.json:\\d+: K003 .*0\\.3.*0\\.4`));
    assert.match(r.stdout, /\n {2}fix: /);
    assert.match(r.stdout, /1 violation\b/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI: usage 2, missing directory 4, --help 0, --json is one object", () => {
  assert.equal(cli([]).status, 2);
  assert.equal(cli(["a", "b"]).status, 2);
  const missing = cli([join(tmpdir(), "GZby9I-nope")]);
  assert.equal(missing.status, 4);
  assert.match(missing.stderr, /GZby9I-nope/);
  assert.equal(cli(["--help"]).status, 0);
  const j = JSON.parse(cli([join(FIXTURES, "maze"), "--json"]).stdout);
  assert.equal(j.ok, true);
});

test("CLI: PKG_TRIAL_LOG gets one JSON line per invocation, whatever the exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "GZby9I-log-"));
  const log = join(dir, "log.jsonl");
  try {
    cli([join(FIXTURES, "maze")], { PKG_TRIAL_LOG: log });
    cli([join(dir, "nope")], { PKG_TRIAL_LOG: log });
    cli([], { PKG_TRIAL_LOG: log });
    const lines = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.length, 3);
    assert.equal(lines[0].ok, true);
    assert.equal(lines[1].ok, false);
    assert.match(lines[1].loadError, /nope/);
    assert.match(lines[2].loadError, /usage/);
    assert.ok(existsSync(log));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
