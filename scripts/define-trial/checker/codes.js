// The checker's codes, as rules.md defines them. D… are about the definition files, C… about the examples.

/** Each code and when it is reported; the tests check that every one has a failing fixture. */
export const CHECK_CODES = Object.freeze({
  D001: "A key defineDialect or defineGrammar does not take, at any level, or a required key that is missing",
  D002: "A type name that resolves to nothing",
  D003: "An intrinsic without a spelling for one of the targets",
  D004: "An intrinsic without ref, params or returns",
  D005: "A slot convention whose space is not declared",
  D006: "A target whose accepts names an undeclared space",
  D007: "A name declared twice across intrinsics, globals, library and objects",
  D008: "A compare mode other than exact() or tolerance(figure) with a positive figure",
  D009: "A lambda slot whose slot names no slot convention",
  D010: "A child construct with a method of its parent's name, or a parent (or root) that is not a construct",
  D011: "A malformed argument spec, shape or helper call, or a helper kit/define does not export",
  D012: "A space without pure: true",
  D013: "A library entry that is not { fn: src } or { const: src }, or whose source does not parse",
  D014: "A slot without a kind, or with a kind other than decl, unit or lambda",
  C001: "An example that neither exports a builder chain nor starts with // REFUSED: <code>",
  C002: "A Runtime Lambda that does not parse in the Runtime Subset",
  C003: "A free name in a Runtime Lambda that the free-name rule does not allow",
  C004: "A builder call to a method the grammar neither defines nor rejects",
});

/** @typedef {keyof typeof CHECK_CODES} CheckCode */

/**
 * A definition file that cannot be loaded at all (a syntax error, an exception, no define call). rules.md
 * gives this no code; an example that cannot be loaded is C001 instead.
 */
export const LOAD = "LOAD";

/**
 * One violation, as the checker prints it: `<file>:<line>: <code> <message>`, then `  fix: <fix>`.
 * @typedef {object} CheckDiagnostic
 * @property {string} file  Path relative to the candidate directory, with `/` separators.
 * @property {number} line  1-based.
 * @property {CheckCode | typeof LOAD} code
 * @property {"error" | "warning"} severity  Only the parser's warnings (S116) are warnings.
 * @property {string} message
 * @property {string} fix  What to write instead.
 */
