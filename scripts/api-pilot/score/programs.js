// The hidden set's programs and what a reject program declares: shared by the scorer and its worker process.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The pilot's language name, which names its definition files. */
export const LANG = "budget";
/** The hidden set's two folders. */
export const KINDS = /** @type {const} */ (["accept", "reject"]);

/**
 * @typedef {{ kind: typeof KINDS[number], file: string, pass: boolean, codes: string[], expected: string[] }} ProgramResult
 * @typedef {{ pass: number, of: number }} Tally
 * @typedef {{ definitions: { ok: boolean, codes: string[] }, results: ProgramResult[], accept: Tally, reject: Tally, warnings: string[] }} Score
 */

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
 * Builds the score from each program's verdict: the tallies, and a warning for each reject program that was
 * refused (it passes) with none of the codes it declares.
 * @param {{ ok: boolean, codes: string[] }} definitions @param {ProgramResult[]} results
 * @returns {Score}
 */
export function summarize(definitions, results) {
  /** @param {typeof KINDS[number]} kind */
  const tally = (kind) => { const of = results.filter((r) => r.kind === kind); return { pass: of.filter((r) => r.pass).length, of: of.length }; };
  const warnings = definitions.ok
    ? results
      .filter((r) => r.kind === "reject" && r.codes.length > 0 && r.expected.length > 0 && !r.codes.some((c) => r.expected.includes(c)))
      .map((r) => `${r.kind}/${r.file} was refused with ${r.codes.join(",")}, not its declared ${r.expected.join(" or ")}`)
    : [];
  return { definitions, results, accept: tally("accept"), reject: tally("reject"), warnings };
}
