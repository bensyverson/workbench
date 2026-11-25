// The scorer's worker process: `node worker.js <hand-in dir> <hidden dir> <result file>`. It loads the hand-in's
// definitions, which is candidate code (it may exit, loop or throw), so score() runs it out of process and
// believes only the result file this writes as its last act.

import { mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { checkDir, definitionFiles, EXAMPLES_DIR } from "../../define-trial/checker/index.js";
import { LANG, listPrograms, expectedCodes, summarize } from "./programs.js";

/** @typedef {import("./programs.js").Score} Score */

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
    /** @type {Array<{ file: string, code: string, severity: string }>} */
    let diagnostics;
    try {
      diagnostics = (await checkDir(work, { lang: LANG })).diagnostics;
    } catch (e) {
      // a missing definition file: the checker cannot start
      diagnostics = [{ file: defs.dialect, code: "LOAD", severity: "error", message: String(e) }].map((d) => ({ ...d }));
    }
    const errors = diagnostics.filter((d) => d.severity === "error");
    const defErrors = errors.filter((d) => d.file === defs.dialect || d.file === defs.grammar);
    const ok = defErrors.length === 0;
    const results = programs.map(({ kind, file, path, as }) => {
      const codes = errors.filter((d) => d.file === as).map((d) => d.code);
      const expected = kind === "reject" ? expectedCodes(path) : [];
      return { kind, file, codes, expected, pass: ok && (kind === "accept" ? codes.length === 0 : codes.length > 0) };
    });
    return summarize({ ok, codes: defErrors.map((d) => d.code) }, results);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [handin, hidden, out] = process.argv.slice(2);
  writeFileSync(out, JSON.stringify(await scoreHere(handin, hidden)));
}
