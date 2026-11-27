// Whether a package's manifest tests catch a broken runtime (leaf mxxKTa): copies the package, replaces one text in its
// runtime (the mutant), rehashes it, and runs its tests on the real kit. A mutant no test fails survives.
//   node scripts/m4-trial/tests-dogfood/mutate.js <package dir> <runtime file> <old text> <new text>
// Prints each failing test's diagnostics and "killed" or "survived".

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { checkPackageDir } from "../../pkg-trial/checker/index.js";
import { hashDir } from "../../pkg/dir.js";

/**
 * The package with one text of one file replaced, its tests run: the diagnostics and the counts.
 * @param {string} dir @param {string} file @param {string} from @param {string} to
 */
export async function mutate(dir, file, from, to) {
  const scratch = mkdtempSync(join(tmpdir(), "mxxKTa-mut-"));
  try {
    const copy = join(scratch, basename(dir));
    cpSync(dir, copy, { recursive: true });
    const path = join(copy, file);
    const text = readFileSync(path, "utf8");
    if (text.split(from).length !== 2) throw new Error(`mutate: ${file} does not hold the old text exactly once`);
    writeFileSync(path, text.replace(from, () => to));
    await hashDir(copy);
    const r = await checkPackageDir(copy);
    return { diagnostics: r.diagnostics, tests: r.tests, killed: r.diagnostics.some((d) => d.code.startsWith("H")) };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, file, from, to] = process.argv.slice(2);
  if (!dir || !file || from === undefined || to === undefined) { console.error("usage: mutate.js <package dir> <runtime file> <old text> <new text>"); process.exit(2); }
  const r = await mutate(dir, file, from, to);
  for (const d of r.diagnostics) console.log(`${d.code} ${d.message}`);
  console.log(r.killed ? `killed: ${r.tests.passed} of ${r.tests.run} tests pass` : `survived: all ${r.tests.run} tests pass`);
}
