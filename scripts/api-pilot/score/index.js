// The API pilot's scorer: runs a hand-in's budget.dialect.js and budget.grammar.js over the hidden programs with
// the define-trial checker (the real kit/define), one temp directory holding them all as examples. An accept
// program passes when its file gets no error; a reject program passes when it gets at least one. An error in
// the definitions fails every program, since none of them could be judged.

import { mkdtempSync, mkdirSync, cpSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDir, definitionFiles, EXAMPLES_DIR } from "../../define-trial/checker/index.js";

/** The pilot's language name, which names its definition files. */
export const LANG = "budget";
/** The hidden set's two folders. */
export const KINDS = /** @type {const} */ (["accept", "reject"]);

/**
 * @typedef {{ kind: typeof KINDS[number], file: string, pass: boolean, codes: string[] }} ProgramResult
 * @typedef {{ pass: number, of: number }} Tally
 * @typedef {{ definitions: { ok: boolean, codes: string[] }, results: ProgramResult[], accept: Tally, reject: Tally }} Score
 */

/**
 * Scores the hand-in in `handin` against the hidden programs in `hidden` (its `accept/` and `reject/`).
 * @param {string} handin @param {string} hidden
 * @returns {Promise<Score>}
 */
export async function score(handin, hidden) {
  const defs = definitionFiles(LANG);
  const work = mkdtempSync(join(tmpdir(), "api-pilot-score-"));
  try {
    for (const f of [defs.dialect, defs.grammar]) if (existsSync(join(handin, f))) cpSync(join(handin, f), join(work, f));
    mkdirSync(join(work, EXAMPLES_DIR));
    /** @type {Array<{ kind: typeof KINDS[number], file: string, as: string }>} */
    const programs = [];
    for (const kind of KINDS) {
      const dir = join(hidden, kind);
      for (const file of existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".js")).sort() : []) {
        const as = `${EXAMPLES_DIR}/${kind}-${file}`;
        cpSync(join(dir, file), join(work, as));
        programs.push({ kind, file, as });
      }
    }
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
    const results = programs.map(({ kind, file, as }) => {
      const codes = errors.filter((d) => d.file === as).map((d) => d.code);
      return { kind, file, codes, pass: ok && (kind === "accept" ? codes.length === 0 : codes.length > 0) };
    });
    /** @param {typeof KINDS[number]} kind */
    const tally = (kind) => { const of = results.filter((r) => r.kind === kind); return { pass: of.filter((r) => r.pass).length, of: of.length }; };
    return { definitions: { ok, codes: defErrors.map((d) => d.code) }, results, accept: tally("accept"), reject: tally("reject") };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
