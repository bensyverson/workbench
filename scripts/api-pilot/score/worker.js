// The scorer's worker process: `node worker.js <hand-in dir> <hidden dir> <result file>`. It loads the hand-in's
// definitions, which is candidate code (it may exit, loop, throw or write the result file itself), so score()
// runs it out of process, and checks the result file this writes as its last act before using it.

import { mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { checkDir, definitionFiles, EXAMPLES_DIR } from "../../define-trial/checker/index.js";
import { LANG, listPrograms, expectedCodes, summarize } from "./programs.js";

/** @typedef {import("./programs.js").Score} Score */
/** @typedef {{ file: string, code: string, severity: string, message: string }} Diagnostic */

/**
 * Checks every hidden program against the hand-in's definitions, in this process.
 * @param {string} handin @param {string} hidden
 * @returns {Promise<Score>}
 */
export async function scoreHere(handin, hidden) {
  const defs = definitionFiles(LANG);
  const work = mkdtempSync(join(tmpdir(), "api-pilot-score-"));
  try {
    for (const f of [defs.dialect, defs.grammar]) if (existsSync(join(handin, f))) cpSync(join(handin, f), join(work, f));
    mkdirSync(join(work, EXAMPLES_DIR));
    const programs = listPrograms(hidden).map((p) => ({ ...p, as: `${EXAMPLES_DIR}/${p.kind}-${p.file}` }));
    for (const p of programs) cpSync(p.path, join(work, p.as));
    /** @type {Diagnostic[]} */
    let diagnostics;
    try {
      diagnostics = (await checkDir(work, { lang: LANG })).diagnostics;
    } catch (e) {
      // a missing definition file: the checker cannot start
      diagnostics = [{ file: defs.dialect, code: "LOAD", severity: "error", message: String(e) }];
    }
    const errors = diagnostics.filter((d) => d.severity === "error").map((d) => ({ ...d, file: owner(d, programs.map((p) => p.as)) }));
    const defErrors = errors.filter((d) => d.file === defs.dialect || d.file === defs.grammar);
    return summarize({ codes: defErrors.map((d) => d.code) }, programs.map(({ kind, file, path, as }) => ({
      kind, file,
      codes: errors.filter((d) => d.file === as).map((d) => d.code),
      expected: kind === "reject" ? expectedCodes(path) : [],
    })));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * The file an error belongs to. The checker files a C005 (the definitions threw) at the definition line that
 * threw, but one program reached it, and its message opens with that program's file: the crash fails that
 * program, not the definitions and so every program.
 * @param {Diagnostic} d @param {string[]} programFiles
 */
function owner(d, programFiles) {
  if (d.code !== "C005") return d.file;
  return programFiles.find((f) => d.message.startsWith(`${f}: `)) ?? d.file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [handin, hidden, out] = process.argv.slice(2);
  writeFileSync(out, JSON.stringify(await scoreHere(handin, hidden)));
}
