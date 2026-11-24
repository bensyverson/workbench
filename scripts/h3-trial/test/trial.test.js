// The H3 trial kit: the packets' examples are valid in their own style, the three tasks are solvable with the
// Dialect, check.js prints and logs what the trial needs, and classify.js separates "expected plain-JS
// semantics" diagnostics from the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { field } from "../../../kit/dialects/fields/index.js";
import { check, checkBuilt, loadProgram } from "../check.js";
import { classify, plainJsReason } from "../classify.js";
import { SOLUTIONS } from "./solutions.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK = join(HERE, "..", "check.js");
const DOCS = join(HERE, "..", "docs");

/** @param {string} body @param {"typed" | "call"} [style] */
const probe = (body, style = "typed") => checkBuilt(() => field("probe").param("k", { value: 1 }).pixel(`(uv, u) => { ${body}\n return color(0, 0, 0); }`).build(), style);

test("each packet's example is valid, and valid only in its own style without notes", async () => {
  const typed = check(await loadProgram(join(DOCS, "typed-example.js")), "typed");
  const call = check(await loadProgram(join(DOCS, "call-example.js")), "call");
  assert.ok(typed.ok && call.ok);
  assert.equal(typed.samples.length, 6);
  assert.deepEqual(call.styleNotes, []);
  assert.deepEqual(typed.samples.map((s) => s.color), call.samples.map((s) => s.color), "the two styles of the example make the same colors");
  assert.ok(check(await loadProgram(join(DOCS, "typed-example.js")), "call").styleNotes.length > 0, "operators on vectors are noted in the call style");
});

test("the packets for one style do not mention the other", () => {
  const typed = readFileSync(join(DOCS, "typed.md"), "utf8"), call = readFileSync(join(DOCS, "call.md"), "utf8");
  assert.doesNotMatch(typed, /vadd|vsub|vscale|vmul|vdiv|vneg|call style/);
  assert.doesNotMatch(call, /plain JS|typed/i);
  for (const t of [typed, call]) assert.doesNotMatch(t, /\bKernel|\bIR\b|Dialect|interpreter|lowering|lowered/);
});

test("the three tasks are solvable with the Dialect's intrinsics", () => {
  for (const [name, s] of Object.entries(SOLUTIONS)) {
    const b = field(name);
    for (const [k, d] of Object.entries(s.params)) b.param(k, d);
    const r = check(b.pixel(s.pixel).build(), "typed");
    assert.deepEqual(r.entries.map((e) => `${e.code} ${e.message}`), [], name);
    assert.ok(r.ok && r.samples.every((x) => x.color && x.color.every(Number.isFinite)), name);
  }
});

test("each plain-JS mistake is classified as one", () => {
  const cases = /** @type {Array<[string, string]>} */ ([
    ["const a = uv + 1;", "L003"],
    ["const a = uv + u.k;", "L003"],
    ["const a = uv == uv;", "L003"],
    ["const a = uv < uv;", "L003"],
    ["const a = \"v: \" + uv;", "L003"],
    ["const a = vec3(1, 2, 3) + color(1, 2, 3);", "L003"],
    ["const a = uv.xy;", "L002"],
    ["const a = vec2(1);", "L015"],
  ]);
  for (const [body, code] of cases) {
    const r = probe(body);
    const errs = r.entries.filter((e) => e.severity === "error");
    assert.ok(errs.length >= 1, body);
    assert.ok(errs.some((e) => e.code === code && plainJsReason(e)), `${body}: ${errs.map((e) => `${e.code} ${e.message}`).join(" | ")}`);
  }
});

// The generated field() (kit/define) refuses these when the Program is built (B008 for a name the lambda cannot
// see, B007 for a lambda that does not parse); check.js turns those refusals into ordinary entries.
test("a name the Dialect lacks and a parse error reach check.js as diagnostics", () => {
  const r = probe("const a = Math.sin(1);");
  assert.equal(r.ok, false);
  assert.ok(r.entries.some((e) => e.code === "B008" && plainJsReason(e)), "Math is a plain-JS mistake");
  for (const body of ["const a = dot(uv, uv);", "const a = ;"]) {
    const errs = probe(body).entries.filter((e) => e.severity === "error");
    assert.ok(errs.length >= 1 && errs.every((e) => plainJsReason(e) === null), body);
  }
});

test("a build refusal is an entry with its code, place, line, text and tip", () => {
  const b = probe("const ok = 1;\n const a = Math.sin(1);").entries.find((e) => e.code === "B008");
  assert.ok(b);
  assert.deepEqual([b.where, b.line, b.text], ["pixel", 2, "const a = Math.sin(1);"]);
  assert.match(b.tip, /\bsin\b/);
  const p = probe("const a = ;").entries.find((e) => e.code === "B007");
  assert.ok(p);
  assert.deepEqual([p.where, p.line], ["pixel", 1]);
  assert.ok(p.message && p.tip);
});

test("other mistakes are not plain-JS expectations", () => {
  for (const body of ["for (let i = 0; i < 3; i += 2) { }"]) {
    const errs = probe(body).entries.filter((e) => e.severity === "error");
    assert.ok(errs.length >= 1, body);
    assert.ok(errs.every((e) => plainJsReason(e) === null), `${body}: ${errs.map((e) => `${e.code} ${e.message}`).join(" | ")}`);
  }
});

test("a diagnostic carries its code, message, tip and line", () => {
  const e = probe("\nconst a = uv + 1;").entries[0];
  assert.deepEqual([e.code, e.where, e.line, e.text], ["L003", "pixel", 2, "const a = uv + 1;"]);
  assert.ok(e.message && e.tip);
});

test("check.js on the command line: output, exit code and the H3_LOG line; classify.js tallies it", () => {
  const dir = mkdtempSync(join(tmpdir(), "h3trial-"));
  const bad = join(dir, "bad.js"), good = join(dir, "good.js"), log = join(dir, "log.jsonl");
  writeFileSync(bad, `import { field } from "fields";\nexport default field("bad").pixel(\`(uv, u) => {\n  const a = uv + 1;\n  return color(a.x, a.y, 0);\n}\`).build();\n`);
  writeFileSync(good, readFileSync(join(DOCS, "typed-example.js"), "utf8"));
  const none = join(dir, "none.js");
  writeFileSync(none, `import { field } from "fields";\nconst x = field("nothing");\n`);
  /** @param {string} style @param {string} file */
  const run = (style, file) => spawnSync(process.execPath, [CHECK, style, file], { encoding: "utf8", env: { ...process.env, H3_LOG: log } });
  const b = run("typed", bad), g = run("typed", good), n = run("typed", none), c = run("call", bad);
  assert.equal(b.status, 1);
  assert.match(b.stdout, /error L003 in pixel, line 2: .*\n.*const a = uv \+ 1;\n.*tip: Build the vector/);
  assert.equal(g.status, 0);
  assert.match(g.stdout, /uv \(0\.5, 0\.5\) -> \(/);
  assert.equal(n.status, 1);
  assert.match(n.stdout, /error LOAD: the file exports no Program/);
  assert.equal(c.status, 1);
  assert.equal(spawnSync(process.execPath, [CHECK, "typed"], { encoding: "utf8" }).status, 2);
  const lines = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines.map((l) => [l.style, l.ok]), [["typed", false], ["typed", true], ["typed", false], ["call", false]]);
  assert.ok(lines[0].source.includes("uv + 1"));
  const c1 = classify(readFileSync(log, "utf8"));
  assert.equal(c1.invocations, 4);
  assert.equal(c1.all.plainJs, 2);
  assert.equal(c1.byStyle.typed.byCode.L003, 1);
  assert.equal(c1.byStyle.typed.byCode.LOAD, 1);
  assert.equal(c1.byStyle.typed.sketches.find((/** @type {{ file: string }} */ s) => s.file === bad)?.firstSuccess, null);
  assert.ok(existsSync(log));
});

test("check.js on a sketch the builder refuses: an ordinary entry, logged, and the classifier counts Math", () => {
  const dir = mkdtempSync(join(tmpdir(), "h3trial-"));
  const file = join(dir, "m.js"), log = join(dir, "log.jsonl");
  writeFileSync(file, `import { field } from "fields";\nexport default field("m").pixel(\`(uv, u) => {\n  return color(Math.sin(uv.x), 0, 0);\n}\`).build();\n`);
  const r = spawnSync(process.execPath, [CHECK, "typed", file], { encoding: "utf8", env: { ...process.env, H3_LOG: log } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /error B008 in pixel, line 2: .*"Math".*\n.*Math\.sin.*\n.*tip: use sin/);
  assert.doesNotMatch(r.stdout, /LOAD/);
  const rec = JSON.parse(readFileSync(log, "utf8"));
  assert.equal(rec.loadError, null);
  assert.equal(classify(readFileSync(log, "utf8")).all.plainJs, 1);
});

test("a call-style sketch that uses an operator on vectors is logged as a STYLE note and counted", () => {
  const dir = mkdtempSync(join(tmpdir(), "h3trial-"));
  const file = join(dir, "s.js"), log = join(dir, "log.jsonl");
  writeFileSync(file, `import { field } from "fields";\nexport default field("s").pixel(\`(uv, u) => {\n  const a = uv * 2;\n  return color(a.x, a.y, 0);\n}\`).build();\n`);
  const r = spawnSync(process.execPath, [CHECK, "call", file], { encoding: "utf8", env: { ...process.env, H3_LOG: log } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /note in pixel, line 2: .*vmul\(a, b\) or vscale\(v, s\)/);
  const c = classify(readFileSync(log, "utf8"));
  assert.deepEqual(c.byStyle.call.byCode, { STYLE: 1 });
  assert.equal(c.all.plainJs, 1);
});

test("a Dialect-coded refusal at build (F002) is an entry, not a LOAD error", () => {
  const r = checkBuilt(() => /** @type {any} */ (field("p")).param("t", { value: 1 }).pixel("(uv, u) => color(0, 0, 0)").build(), "typed");
  assert.equal(r.ok, false);
  assert.ok(r.entries.some((e) => e.code === "F002"), JSON.stringify(r.entries));
});

test("a B008 beside a Dialect-coded refusal is still counted", () => {
  const r = checkBuilt(() => /** @type {any} */ (field("p")).param("t", { value: 1 }).pixel("(uv, u) => color(Math.sin(uv.x), 0, 0)").build(), "typed");
  assert.deepEqual(r.entries.map((e) => e.code).sort(), ["B008", "F002"]);
});
