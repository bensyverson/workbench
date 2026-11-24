// Review of 04567fb (jobs ZAV0oC and t0Ud0o), from the reviewer's probes
// local/rev-04567fb-probes/scanner{,-e2e}.probe.js. A closure a factory made is not vouched for as a helper
// after a regex the scan once read as division; a name the scan finds twice at a file's top level is the
// checker's LOAD, not a guess at either declaration; and C001 takes `($ = {}) => …` as a function of one parameter.
// @ts-nocheck: lambdas name the Dialect's free names, which TypeScript cannot see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { helperSources, moduleScope, checkExport } from "../checker/examples.js";
import { session } from "../checker/session.js";
import { withScope, SCOPE_EXPORT } from "../checker/hooks.js";
import { checkDir } from "../checker/index.js";
import { field } from "../../../kit/dialects/fields/grammar.js";

const TEXT = [
  "const k = 100;",
  "const f0 = mk(3);",
  "function mk(k) { if (k) /\\}/.test(\"\"); const f0 = (x) => x * k; return f0; }",
  "export default (u) => field(\"f\").pixel((uv) => color(f0(uv.x), 0, 0));",
  "",
].join("\n");

test("a factory-made closure is not accepted as a helper, even after `if (k) /\\}/`", () => {
  const k = 100;
  function mk(k) { if (k) /\}/.test(""); const f0 = (x) => x * k; return f0; }
  const f0 = mk(3);
  const sources = helperSources(TEXT);
  assert.equal(sources.f0, "mk(3)", "the top-level declaration's init vouches");
  const ds = field("f").pixel((uv) => color(f0(uv.x), 0, 0)).check({ scope: { k, f0 }, sources });
  assert.deepEqual(ds.map((d) => d.code), ["B012"]);
});

test("end to end: the closure f0 = mk(3) is refused B012, not built as a helper reading the top-level k", () => {
  const k = 100;
  function mk(k) { if (k) /\}/.test(""); const f0 = (x) => x * k; return f0; }
  const f0 = mk(3);
  const options = { scope: { k, f0 }, sources: helperSources(TEXT) };
  const b = field("f").pixel((uv) => color(f0(uv.x), 0, 0));
  const ds = b.check(options);
  let units = null;
  if (!ds.length) units = b.build(options).units;
  assert.deepEqual(ds.map((d) => d.code), ["B012"], `accepted; units = ${JSON.stringify(units)}`);
});

test("a name the scan finds twice at a file's top level is LOAD at its second line, and the file's scope is not used", () => {
  session.reset("file:///tmp/x/", { "examples/09.js": "const a = 1;\nconst b = 2;\nconst a = (x) => x;\n" });
  assert.equal(moduleScope("examples/09.js", {}), null);
  assert.deepEqual(session.diagnostics.map((d) => [d.file, d.line, d.code]), [["examples/09.js", 3, "LOAD"]]);
  assert.match(session.diagnostics[0].message, /'a'/);
  session.reset("file:///tmp/x/", { "examples/09.js": "const a = 1;\nexport default ($) => a;\n" });
  assert.deepEqual(moduleScope("examples/09.js", { __defineTrialScope: () => ({ a: 1 }) })?.sources, { a: "1" });
  assert.deepEqual(session.diagnostics, []);
});

test("a non-ASCII top-level name reaches the module scope the epilogue hands the checker", async () => {
  const m = await import(`data:text/javascript,${encodeURIComponent(withScope("const τ = 6.28;\nconst half = (x) => x / τ;\n"))}`);
  assert.deepEqual(Object.keys(m[SCOPE_EXPORT]()), ["τ", "half"]);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "..", "fixtures", "valid");

/** The passing fixture with examples/01.js's export line replaced by `to`, checked. @param {string} to */
async function withExport(to) {
  const dir = mkdtempSync(join(tmpdir(), "define-trial-"));
  try {
    cpSync(VALID, dir, { recursive: true });
    const path = join(dir, "examples", "01.js"), src = readFileSync(path, "utf8");
    const from = "export default ($) => program(\"glow\")";
    assert.equal(src.split(from).length, 2);
    writeFileSync(path, src.replace(from, to));
    return await checkDir(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("C001 takes a one-parameter export with a default, `($ = {}) => …` or `({ speed } = {}) => …`", async () => {
  for (const to of ["export default ($ = {}) => program(\"glow\")", "export default ({ speed } = {}) => program(\"glow\")", "export default ($ = {},) => program(\"glow\")"]) {
    const r = await withExport(to);
    assert.deepEqual(r.diagnostics.filter((d) => d.code === "C001"), [], to);
  }
});

test("C001 still refuses no parameter, two parameters and a rest parameter", async () => {
  for (const to of ["export default () => program(\"glow\")", "export default ($, x) => program(\"glow\")", "export default ($ = {}, x) => program(\"glow\")", "export default (...$) => program(\"glow\")"]) {
    const r = await withExport(to);
    assert.deepEqual(r.diagnostics.filter((d) => d.code === "C001").map((d) => [d.file, d.line]), [["examples/01.js", 1]], to);
  }
  session.reset("file:///tmp/x/", { "examples/09.js": "export default function (a = 1, b) {}\n" });
  assert.equal(checkExport("examples/09.js", function (a = 1, b) { return [a, b]; }), null);
});
