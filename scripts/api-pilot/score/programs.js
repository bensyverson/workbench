// The hidden set's programs, what a reject program declares, and how a program's codes become its verdict:
// shared by the scorer and its worker process.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The pilot's language name, which names its definition files. */
export const LANG = "budget";
/** The hidden set's two folders. */
export const KINDS = /** @type {const} */ (["accept", "reject"]);

/**
 * @typedef {{ kind: typeof KINDS[number], file: string, codes: string[], expected: string[] }} Verdict  the error codes one program got, and those it declares
 * @typedef {Verdict & { pass: boolean }} ProgramResult
 * @typedef {{ pass: number, of: number }} Tally
 * @typedef {{ definitions: { ok: boolean, codes: string[] }, results: ProgramResult[], accept: Tally, reject: Tally, declared: Tally, warnings: string[] }} Score
 */

/**
 * Codes that say the candidate's own code failed, not that it refused the program: the example did not load or
 * export a Program (C001), a file did not load (LOAD), or the definitions threw (C005). A reject program that
 * gets only these was not refused, so it fails.
 */
export const NOT_REFUSALS = Object.freeze(["C001", "LOAD", "C005"]);

/**
 * Whether one program passes: never while the definitions failed; an accept program with no error; a reject
 * program with at least one error that is a refusal.
 * @param {boolean} definitionsOk @param {typeof KINDS[number]} kind @param {string[]} codes
 */
export function passes(definitionsOk, kind, codes) {
  if (!definitionsOk) return false;
  return kind === "accept" ? codes.length === 0 : codes.some((c) => !NOT_REFUSALS.includes(c));
}

/**
 * Every hidden program, accept then reject, each folder sorted by name.
 * @param {string} hidden
 * @returns {Array<{ kind: typeof KINDS[number], file: string, path: string }>}
 */
export function listPrograms(hidden) {
  return KINDS.flatMap((kind) => {
    const dir = join(hidden, kind);
    return (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".js")).sort() : []).map((file) => ({ kind, file, path: join(dir, file) }));
  });
}

/**
 * The codes a reject program declares in its first line, `// REJECT 1: what it does (expect: L002, B003)`: any of
 * them is the refusal that program is for. Empty when it declares none.
 * @param {string} path
 * @returns {string[]}
 */
export function expectedCodes(path) {
  const m = /\(expect: ([A-Z]\d{3}(?:, [A-Z]\d{3})*)\)\s*$/.exec(readFileSync(path, "utf8").split("\n", 1)[0]);
  return m ? m[1].split(", ") : [];
}

/**
 * Builds the score from each program's codes: its pass, the tallies, the declared tally (reject programs that
 * pass with a code their header declares, of those that declare one), and a warning for each reject program
 * that passes with none of the codes it declares. The definitions are ok when they got no code.
 * @param {{ codes: string[] }} definitions @param {Verdict[]} verdicts
 * @returns {Score}
 */
export function summarize({ codes: defCodes }, verdicts) {
  const ok = defCodes.length === 0;
  /** @type {ProgramResult[]} */
  const results = verdicts.map((v) => ({ ...v, pass: passes(ok, v.kind, v.codes) }));
  /** @param {ProgramResult[]} of */
  const tally = (of) => ({ pass: of.filter((r) => r.pass).length, of: of.length });
  const rejects = results.filter((r) => r.kind === "reject");
  const declaring = rejects.filter((r) => r.expected.length > 0);
  /** @param {ProgramResult} r */
  const hitsDeclared = (r) => r.codes.some((c) => r.expected.includes(c));
  const warnings = declaring
    .filter((r) => r.pass && !hitsDeclared(r))
    .map((r) => `${r.kind}/${r.file} was refused with ${r.codes.join(",")}, not its declared ${r.expected.join(" or ")}`);
  return {
    definitions: { ok, codes: defCodes },
    results,
    accept: tally(results.filter((r) => r.kind === "accept")),
    reject: tally(rejects),
    declared: { pass: declaring.filter((r) => r.pass && hitsDeclared(r)).length, of: declaring.length },
    warnings,
  };
}
