// The Definition API trial's checker (the kit's `check`): loads a candidate directory's Dialect, Grammar and
// examples with the real kit/define, runs each example's Program through the generated builder and lowers
// it, and returns every diagnostic: the kit's own D…, B… and L… codes, and the checker's C… for the rules
// the kit does not enforce.

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as kit from "../../../kit/define/index.js";
import { didYouMean } from "../../../kit/lower/codes.js";
import { session, candidateFrame } from "./session.js";
import { installHooks, DEFINE_SPECIFIER } from "./hooks.js";
import { checkExport, runProgram, reportBuild, reportThrown, moduleScope, declaredRefusal, EXAMPLES_DIR } from "./examples.js";
import { LOAD, REFUSED } from "./codes.js";

export { CHECK_CODES, RETIRED_CODES, LOAD, EFFECTS_CODES, REFUSED } from "./codes.js";
export { EXAMPLES_DIR } from "./examples.js";
/** @typedef {import("./codes.js").CheckDiagnostic} CheckDiagnostic */

/**
 * The definition files of a language named `lang`: `<lang>.dialect.js` and `<lang>.grammar.js` (`data` by default,
 * the define-trial's data-tools language; the API pilot's is `budget`).
 * @param {string} [lang]
 */
export function definitionFiles(lang = "data") {
  if (!/^[a-z][a-z0-9-]*$/.test(lang)) throw new TypeError(`a language name is a lower-case word (letters, digits, "-"), not '${lang}'`);
  return { dialect: `${lang}.dialect.js`, grammar: `${lang}.grammar.js` };
}

/** The data-tools language's definition files, the default. */
export const { dialect: DIALECT_FILE, grammar: GRAMMAR_FILE } = definitionFiles();

/** The definition files of the check in progress (checks run one at a time). */
let defs = definitionFiles();

/** What a candidate may import from kit/define (its helpers and define calls), for a did-you-mean. */
const EXPORTS = Object.keys(kit);

/** A candidate directory the checker cannot read: missing, or without its definition files. */
export class CheckTargetError extends Error {}

/**
 * @typedef {object} CheckResult
 * @property {boolean} ok  No error-severity diagnostic.
 * @property {CheckDiagnostic[]} diagnostics  In file order (Dialect, Grammar, examples), then by line.
 * @property {Record<string, string>} files  Every candidate file's text, by its path relative to the directory.
 */

let queue = Promise.resolve();

/**
 * Checks one candidate directory. Checks run one at a time (the candidate's kit/define reports to one session).
 * @param {string} dir
 * @param {{ lang?: string, effects?: boolean }} [options]  `lang` names the definition files (definitionFiles); `effects` runs the per-slot effects draft (docs/api-effects.md, checker/effects/)
 * @returns {Promise<CheckResult>}
 */
export function checkDir(dir, { lang = "data", effects = false } = {}) {
  const files = definitionFiles(lang);
  const run = queue.then(() => { defs = files; return checkNow(resolve(dir), lang, effects); });
  queue = run.then(() => undefined, () => undefined);
  return run;
}

/** @param {string} dir @param {string} lang @param {boolean} effects @returns {Promise<CheckResult>} */
async function checkNow(dir, lang, effects) {
  const { dialect: DIALECT_FILE, grammar: GRAMMAR_FILE } = defs;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new CheckTargetError(`${dir} is not a directory; give the directory that holds ${DIALECT_FILE}, ${GRAMMAR_FILE} and ${EXAMPLES_DIR}/`);
  for (const f of [DIALECT_FILE, GRAMMAR_FILE]) if (!existsSync(join(dir, f))) throw new CheckTargetError(`${join(dir, f)} does not exist; the check needs ${DIALECT_FILE} and ${GRAMMAR_FILE}`);
  const exDir = join(dir, EXAMPLES_DIR);
  const examples = existsSync(exDir) ? readdirSync(exDir).filter((f) => f.endsWith(".js")).sort().map((f) => `${EXAMPLES_DIR}/${f}`) : [];
  const order = [DIALECT_FILE, GRAMMAR_FILE, ...examples];
  /** @type {Record<string, string>} */
  const sources = Object.fromEntries(order.map((f) => [f, readFileSync(join(dir, f), "utf8")]));

  installHooks();
  // Node names modules by their real path (macOS's /var is /private/var), and so do stack frames.
  const dirUrl = pathToFileURL(realpathSync(dir)).href.replace(/\/?$/, "/");
  session.reset(dirUrl, sources, effects);
  if (examples.length === 0) session.add({ file: EXAMPLES_DIR, line: 1, code: "C007", severity: "error", message: `there is no ${EXAMPLES_DIR}/*.js; the hand-in needs one file per Dream Code example.`, fix: `write ${EXAMPLES_DIR}/01.js … ${EXAMPLES_DIR}/10.js, each a Program or a // REFUSED: file (rules.md R6)` });
  /** @param {string} f */
  const load = (f) => import(`${dirUrl}${f.split("/").map(encodeURIComponent).join("/")}?run=${session.run}`);

  let definitionsLoaded = true;
  try {
    await load(DIALECT_FILE);
    if (!session.dialectSite) loadFailure(DIALECT_FILE, 1, `${DIALECT_FILE} does not call defineDialect.`, `write export const ${lang} = defineDialect({ … }), importing defineDialect from "${DEFINE_SPECIFIER}"`);
  } catch (e) {
    definitionsLoaded = false;
    reportLoadError(e, DIALECT_FILE);
  }
  try {
    await load(GRAMMAR_FILE);
    if (!session.grammar && !session.refused) { definitionsLoaded = false; loadFailure(GRAMMAR_FILE, 1, `${GRAMMAR_FILE} does not call defineGrammar.`, `write export const program = defineGrammar(${lang}, { … }), importing defineGrammar from "${DEFINE_SPECIFIER}"`); }
  } catch (e) {
    definitionsLoaded = false;
    reportLoadError(e, GRAMMAR_FILE);
  }

  // Examples import the grammar; while it is refused or does not load, each would only repeat its error.
  if (definitionsLoaded && !session.refused && session.grammar) {
    for (const f of examples) {
      const before = session.diagnostics.length;
      /** @type {Record<string, unknown> | null} */
      let mod = null;
      try {
        mod = await load(f);
      } catch (e) {
        reportLoadError(e, f);
      }
      const programFn = mod && checkExport(f, mod.default);
      const scope = mod && programFn && moduleScope(f, mod);
      if (programFn && scope) runProgram(f, programFn, session.grammar, scope);
      if (session.effects && declaredRefusal(f) !== null) settleRefusal(f, before, programFn !== null);
    }
  }

  const rank = (/** @type {string} */ f) => (order.includes(f) ? order.indexOf(f) : order.length);
  const diagnostics = [...session.diagnostics].sort((a, b) => rank(a.file) - rank(b.file) || a.line - b.line);
  return { ok: !diagnostics.some((d) => d.severity === "error"), diagnostics, files: sources };
}

/**
 * --effects: an example marked `// REFUSED: <code>` must fail. What it failed with since `before` is folded into one
 * info line beside its declared code (no gating on the match); if it failed with nothing, that is C008.
 * @param {string} file @param {number} before  the diagnostics' count before the example ran @param {boolean} hasProgram
 */
function settleRefusal(file, before, hasProgram) {
  const declared = declaredRefusal(file);
  const fresh = session.diagnostics.splice(before);
  const failed = fresh.filter((d) => d.severity === "error");
  if (failed.length === 0) {
    session.add({ file, line: 1, code: "C008", severity: "error", message: `${file} is marked // REFUSED: ${declared}, but ${hasProgram ? "its Program builds and lowers clean" : "it exports no Program, so nothing was refused"}.`, fix: hasProgram ? "a refusal is a valid Program with one mistake the language refuses: put the mistake back, or make the language refuse it" : "export the Program with its one mistake, export default ($) => particles(…)…, after the // REFUSED: line" });
    return;
  }
  const given = failed.map((d) => `${d.code} (${d.file}:${d.line}: ${d.message})`).join("; ");
  session.add({ file, line: 1, code: REFUSED, severity: "info", message: `declared ${declared}; the checker gave ${given}`, fix: "nothing: a refusal must fail, and it did; whether the codes match the one declared is read by hand" });
}

/**
 * @param {string} file @param {number} line @param {string} message @param {string} fix
 */
function loadFailure(file, line, message, fix) {
  session.add({ file, line, code: file.startsWith(`${EXAMPLES_DIR}/`) ? "C001" : LOAD, severity: "error", message, fix });
}

/**
 * An import that threw: the builder's B001 is reported as the kit gave it, a helper kit/define lacks is D011,
 * an exception inside the definitions while an example ran is C005, and anything else is reported against the
 * file.
 * @param {unknown} e
 * @param {string} file  the file whose import threw
 */
function reportLoadError(e, file) {
  if (e instanceof kit.BuildError) { reportBuild(e.diagnostics, file); return; }
  const err = e instanceof Error ? e : new Error(String(e));
  // The innermost candidate file on the error's stack is where it went wrong (a syntax error's position
  // comes first in the stack, as `file:…:line`).
  let where = candidateFrame(`${err.stack ?? ""}`) ?? (err instanceof SyntaxError ? syntaxErrorSite() : null) ?? { file, line: 1 };
  const missing = /The requested module '([^']+)' does not provide an export named '([^']+)'/.exec(err.message);
  if (missing && missing[1] === DEFINE_SPECIFIER) {
    session.add({ file: where.file, line: where.line, code: "D011", severity: "error", message: `${DEFINE_SPECIFIER} has no export '${missing[2]}'.${didYouMean(missing[2], EXPORTS)}`, fix: `import only what api-draft.md names: ${EXPORTS.join(", ")}` });
    return;
  }
  const isExample = file.startsWith(`${EXAMPLES_DIR}/`);
  if (isExample && (where.file === defs.dialect || where.file === defs.grammar) && !(err instanceof SyntaxError)) { reportThrown(err, file, "while its builder calls ran"); return; }
  const fix = err instanceof SyntaxError ? "fix the JavaScript syntax at that line" : "the file must load: only kit/define and your own files may be imported, and nothing may be read from outside them";
  if (where.file !== file && !where.file.startsWith(`${EXAMPLES_DIR}/`) && isExample) where = { file, line: 1 };
  // The Grammar importing a Dialect that failed to load fails with the Dialect's error, already reported.
  if (where.file !== file && session.diagnostics.some((d) => d.code === LOAD && d.file === where.file)) return;
  loadFailure(where.file, where.line, `${file} could not be loaded: ${err.name}: ${err.message.split("\n")[0]}`, fix);
}

/**
 * Where the first candidate file with a syntax error has it. An import's SyntaxError carries no position
 * in its stack, so each file is parsed with `node --check`, which prints `<path>:<line>`.
 * @returns {{ file: string, line: number } | null}
 */
function syntaxErrorSite() {
  for (const file of Object.keys(session.sources)) {
    const path = fileURLToPath(new URL(file, session.dirUrl));
    const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
    if (r.status === 0) continue;
    const m = /^.*:(\d+)\n/.exec(r.stderr);
    return { file, line: m ? Number(m[1]) : 1 };
  }
  return null;
}
