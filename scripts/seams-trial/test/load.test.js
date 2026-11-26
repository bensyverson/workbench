// The compose loader's printing: a glue that throws a coded kit error (a handle's unknown property, S301) is a
// diagnostic at its line with a fix, not a crash; and a diagnostic's file is the glue's path, with no query.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCompose } from "../checker/load.js";

const EXAMPLE = fileURLToPath(new URL("../fixtures/example/", import.meta.url));

/** The example with one edit to its glue, loaded. @param {string} from @param {string} to */
async function edited(from, to) {
  const d = mkdtempSync(join(tmpdir(), "WnmLua-load-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const p = join(d, "compose/workbench.js");
    const t = readFileSync(p, "utf8");
    assert.ok(t.includes(from));
    writeFileSync(p, t.replace(from, () => to));
    return await loadCompose(d, ["drums", "board"], { glue: "compose/workbench.js" });
  } finally { rmSync(d, { recursive: true, force: true }); }
}

test("a glue reading a property a handle lacks is S301 at that line, with a fix, not a LOAD", async () => {
  const r = await edited("  return compose(", "  const at = beat.out.hit.at;\n  return compose(");
  assert.equal(r.diagnostics.length, 1, JSON.stringify(r.diagnostics));
  const [d] = r.diagnostics;
  assert.equal(d.code, "S301");
  assert.equal(d.file, "compose/workbench.js");
  assert.equal(d.line, 10);
  assert.match(d.message, /beat\.out\.hit\.at/);
  assert.ok(d.fix && d.fix.length > 0);
});

test("a glue that throws an uncoded error is still a LOAD diagnostic at the glue, with the error's message", async () => {
  const r = await edited("  return compose(", "  throw new Error(\"boom\");\n  return compose(");
  assert.deepEqual(r.diagnostics.map((d) => [d.file, d.code]), [["compose/workbench.js", "LOAD"]]);
  assert.match(r.diagnostics[0].message, /boom/);
});

test("a composition diagnostic names the glue's path with no query", async () => {
  const r = await edited(", { delay: true }", "");
  assert.deepEqual(r.diagnostics.map((d) => `${d.file} ${d.code}`), ["compose/workbench.js S115"]);
  assert.ok(r.diagnostics[0].fix?.includes("delay: true"));
});
