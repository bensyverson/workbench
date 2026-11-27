// Whether a package's manifest tests catch a broken runtime (leaf mxxKTa): copies the package, replaces one text in its
// runtime (the mutant), rehashes it, and runs its tests through the simulator. A mutant no test fails survives.
//   node scripts/m4-trial/tests-dogfood/mutate.js <package dir> <runtime file> <old text> <new text>
// Prints each failing test's diagnostics and "killed" or "survived".

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runPackageTests } from "./sim.js";

const [dir, file, from, to] = process.argv.slice(2);
if (!dir || !file || from === undefined || to === undefined) { console.error("usage: mutate.js <package dir> <runtime file> <old text> <new text>"); process.exit(2); }
const copy = join(mkdtempSync(join(tmpdir(), "mxxKTa-mut-")), basename(dir));
cpSync(dir, copy, { recursive: true });
const path = join(copy, file);
const text = readFileSync(path, "utf8");
if (text.split(from).length !== 2) { console.error(`mutate: ${file} does not hold the old text exactly once`); process.exit(2); }
writeFileSync(path, text.replace(from, () => to));
execFileSync("node", [fileURLToPath(new URL("../../pkg/hash.js", import.meta.url)), copy]);
const r = await runPackageTests(copy);
for (const d of r.diagnostics) console.log(`${d.code} ${d.message}`);
console.log(r.diagnostics.length ? `killed: ${r.results.filter((x) => !x.ok).length} of ${r.results.length} tests fail` : `survived: all ${r.results.length} tests pass`);
