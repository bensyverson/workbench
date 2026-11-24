// One example file: its export (C001: a function of the params, `($) => program(…)…`), then its Program built
// by kit/define's run() (every B… code and the Dialect's own checks) and, when that is clean, the Grammar's
// lower(record): construct state, slot conventions and every lambda's body (B003, B010, B011, L…). Each
// diagnostic is placed at a line of a candidate file.

import * as kit from "../../../kit/define/index.js";
import { session, candidateFrame } from "./session.js";
import { lineAt, locate } from "./locate.js";
import { buildTimeNames, topLevelBindings } from "../../../kit/parse/toplevel.js";

/** @import { CheckDiagnostic } from "./codes.js" */

export const EXAMPLES_DIR = "examples";
const REFUSED = /^\/\/ REFUSED: \S/;

/**
 * A diagnostic as kit/define gives it: a builder's (at the call) or a lowering's (inside a lambda, or a unit).
 * @typedef {{ code: string, severity: string, message: string, tip?: string, fix?: string, file?: string, loc?: { start: { line: number } }, ref?: { id: string, kind: string }, unit?: string }} KitDiagnostic
 */

/** @param {unknown} v */
function isBuilder(v) {
  if (v === null || typeof v !== "object") return false;
  try { return /^\[\S+ builder '/.test(String(v)); } catch { return false; }
}

/** The export C001 asks for. */
const FORM = "export default ($) => program(\"…\")…;";

/**
 * C001: an example's default export is its Program as a function of the params, `($) => program(…)…`, or the
 * file begins with `// REFUSED: <code>`. Returns the function.
 * @param {string} file
 * @param {unknown} exported
 * @returns {((params: any) => unknown) | null}
 */
export function checkExport(file, exported) {
  const src = session.sources[file] ?? "";
  const refused = REFUSED.test(src.split("\n")[0].trimEnd());
  // Outside a "type": "module" package a file with no ESM syntax loads as CommonJS, whose default is {}.
  if (!/\bexport\b/.test(src)) exported = undefined;
  if (typeof exported === "function" && exported.length === 1) return /** @type {(params: any) => unknown} */ (exported);
  if (typeof exported === "function") {
    session.add({ file, line: 1, code: "C001", severity: "error", message: `${file}'s default export is a function of ${exported.length} parameters; a Program is a function of one parameter, the params, which the kit calls with $.`, fix: `take the params as its one parameter: ${FORM}` });
    return null;
  }
  if (isBuilder(exported)) {
    session.add({ file, line: 1, code: "C001", severity: "error", message: `${file} exports the builder chain itself; a Program is a function of its params, which the kit calls with $.`, fix: `wrap the chain: ${FORM}` });
    return null;
  }
  if (exported !== null && typeof exported === "object" && /\.build\(\)/.test(src)) {
    session.add({ file, line: 1, code: "C001", severity: "error", message: `${file} exports what .build() returns, not a function returning the builder chain.`, fix: `remove .build() and wrap the chain: ${FORM}` });
    return null;
  }
  if (refused && exported === undefined) return null;
  session.add({
    file, line: 1, code: "C001", severity: "error",
    message: exported === undefined ? `${file} neither exports its Program, ($) => program(…)…, nor starts with // REFUSED: <code>.` : `${file}'s default export is not a function of the params returning a builder chain.`,
    fix: `end it with ${FORM} (without .build()), or make its first line // REFUSED: <code> followed by the diagnostic and why`,
  });
  return null;
}

/**
 * An example's module scope, as the builder takes it: its top-level bindings (from the export the load hook
 * appends), each top-level `const` declaration's initializer text (a helper's must be its own) and the names its
 * text declares only inside build-time code.
 * @param {string} file @param {Record<string, unknown>} mod
 * @returns {import("../../../kit/define/define.js").BuildOptions}
 */
export function moduleScope(file, mod) {
  const get = mod.__defineTrialScope;
  const text = session.sources[file] ?? "";
  return { scope: typeof get === "function" ? get() : {}, sources: helperSources(text), buildTime: buildTimeNames(text) };
}

/**
 * Each top-level `const` declaration's initializer text, by name: what vouches for a helper. A `let`'s does not,
 * since the binding may be reassigned to an arrow made by other code with the same text.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function helperSources(text) {
  return Object.fromEntries(topLevelBindings(text).filter((b) => b.keyword === "const").map((b) => [b.name, b.init]));
}

/**
 * The example's Program built by run() (its params at their declared values), then, if it has no error, through
 * the Grammar's lower().
 * @param {string} file
 * @param {(params: any) => unknown} programFn  the example's default export
 * @param {any} grammar  the root builder defineGrammar returned, which has lower()
 * @param {import("../../../kit/define/define.js").BuildOptions} [options]  its module scope
 */
export function runProgram(file, programFn, grammar, options = {}) {
  /** @type {{ record: Record<string, any> | null, diagnostics: KitDiagnostic[] }} */
  let built;
  try {
    built = kit.run(programFn, options);
  } catch (e) {
    if (e instanceof TypeError && /must return the Program's builder chain/.test(e.message)) {
      const src = session.sources[file] ?? "";
      session.add({ file, line: 1, code: "C001", severity: "error", message: `${file}'s default export does not return a builder chain${/\.build\(\)/.test(src) ? ": it returns what .build() returns" : ""}.`, fix: /\.build\(\)/.test(src) ? `remove .build() from the end of the chain: ${FORM}` : `return the chain: ${FORM}` });
      return;
    }
    reportThrown(e, file, "when its Program was built");
    return;
  }
  reportBuild(built.diagnostics, file);
  if (!built.record) return;
  /** @type {{ diagnostics: KitDiagnostic[], lambdas: Array<{ ref: { id: string }, src: string }> }} */
  let lowered;
  try {
    lowered = grammar.lower(built.record);
  } catch (e) {
    // A convention function's result is checked as a static convention is, and refused the same way.
    if (e instanceof kit.DefinitionError && session.dialectSite) { session.report(session.dialectSite, e.diagnostics, ` (when ${file} was lowered)`); return; }
    reportThrown(e, file, "when its Program was lowered");
    return;
  }
  for (const d of lowered.diagnostics) {
    if (d.code.startsWith("B") || !d.ref && !d.unit) reportBuild([d], file);
    else if (d.ref) reportInLambda(d, file, lowered.lambdas);
    else reportInUnit(d, file);
  }
}

/**
 * Diagnostics placed at a builder call (the kit's `file` and `loc`).
 * @param {KitDiagnostic[]} ds @param {string} file  the example being checked, for a diagnostic with no place
 */
export function reportBuild(ds, file) {
  for (const d of ds) {
    const at = session.relative(d.file);
    add(d, at ?? file, at ? d.loc?.start.line ?? 1 : 1, d.message);
  }
}

/**
 * A lowering diagnostic inside a lambda: its `loc` is within the lambda's source, found in the file.
 * @param {KitDiagnostic} d @param {string} file @param {Array<{ ref: { id: string }, src: string }>} lambdas
 */
function reportInLambda(d, file, lambdas) {
  const at = session.relative(d.file) ?? file;
  const src = lambdas.find((l) => l.ref.id === d.ref?.id)?.src ?? "";
  // Lambdas with the same text are found in order: this one is the Nth, counting the earlier ones in the file.
  const nth = lambdas.slice(0, lambdas.findIndex((l) => l.ref.id === d.ref?.id)).filter((l) => l.src === src).length;
  const line = lineIn(session.sources[at] ?? "", src, nth);
  add(d, at, line === null ? 1 : line + (d.loc?.start.line ?? 1) - 1, `the ${d.ref?.kind} lambda ${d.ref?.id}: ${d.message}`);
}

/**
 * A lowering diagnostic in a helper or constant: a Library entry's is in the Dialect, a Program unit's at its call.
 * @param {KitDiagnostic} d @param {string} file
 */
function reportInUnit(d, file) {
  const name = /** @type {string} */ (d.unit);
  const text = session.sources[file] ?? "";
  const call = new RegExp(`\\.\\w+\\(\\s*["'\`]${name.replace(/[$]/g, "\\$")}["'\`]`).exec(text);
  const library = /** @type {any} */ (session.dialectDef)?.library;
  if (!call && library && Object.hasOwn(library, name) && session.dialectSite) {
    const s = session.dialectSite;
    add(d, s.file, locate(session.sources[s.file] ?? "", s.line, ["library", name]), `the Library's '${name}': ${d.message}`);
    return;
  }
  // a top-level binding the builder resolved into a unit
  const top = call ? null : new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${name.replace(/[$]/g, "\\$")}\\s*=`, "m").exec(text);
  const at = call ?? top;
  add(d, file, at ? lineAt(text, at.index) + (d.loc?.start.line ?? 1) - 1 : 1, `the helper '${name}': ${d.message}`);
}

/**
 * The 1-based line where the `nth` (0-based) occurrence of `src` starts in `text`, as written or as a string
 * literal's contents; null if absent.
 * @param {string} text @param {string} src @param {number} nth
 */
function lineIn(text, src, nth) {
  if (!src) return null;
  /** @type {Set<number>} */
  const at = new Set();
  for (const form of [src, JSON.stringify(src).slice(1, -1), src.replace(/\n/g, "\\n")]) {
    for (let i = text.indexOf(form); i >= 0; i = text.indexOf(form, i + 1)) at.add(i);
  }
  const sorted = [...at].sort((a, b) => a - b);
  return sorted.length ? lineAt(text, sorted[Math.min(nth, sorted.length - 1)]) : null;
}

/**
 * C005: an exception from the author's code in the definitions (a hook, a check, a convention, state init or
 * step) while an example ran, at the line that threw when it is in a candidate file.
 * @param {unknown} e @param {string} file @param {string} when
 */
export function reportThrown(e, file, when) {
  const err = e instanceof Error ? e : new Error(String(e));
  const where = candidateFrame(`${err.stack ?? ""}`) ?? { file, line: 1 };
  session.add({
    file: where.file, line: where.line, code: "C005", severity: "error",
    message: `${file}: ${when}, ${err.name}: ${err.message.split("\n")[0]}`,
    fix: "the definitions' functions must return a value for every Program the grammar accepts; guard the case this example reaches",
  });
}

/**
 * @param {KitDiagnostic} d @param {string} file @param {number} line @param {string} message
 */
function add(d, file, line, message) {
  /** @type {CheckDiagnostic["severity"]} */
  const severity = d.severity === "warning" || d.severity === "info" ? d.severity : "error";
  session.add({ file, line, code: d.code, severity, message, fix: d.tip || (d.fix ? `write ${d.fix}` : FIXES[d.code[0]] ?? "see api-draft.md") });
}

/** A fix line for a diagnostic the kit gave without a tip, by its code's letter. */
const FIXES = /** @type {Record<string, string>} */ ({
  B: "see the builder's codes in api-draft.md",
  L: "fix the lambda's body: lowering type-checks it against the slot convention",
});
