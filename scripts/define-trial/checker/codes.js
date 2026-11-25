// The checker's own codes: the rules kit/define does not enforce (rules.md). Everything else it prints is
// the kit's own code: D… from defineDialect / defineGrammar, B… from the generated builder and from
// lowering a record (construct state, conventions), L… from lowering each lambda, a Dialect's own letter
// from its checks.

/** Each code and when it is reported; the tests check that every one has a failing fixture. */
export const CHECK_CODES = Object.freeze({
  C001: "An example that neither exports its Program as a function of its one parameter, the params, ($) => program(…)…, nor starts with // REFUSED: <code>",
  C005: "A function in the definitions (environment, a slot convention, a check, state init or step) threw while an example was checked",
  C006: "A definition file or example imports something other than \"kit/define\" or the candidate's own files (R1)",
  C007: "The hand-in has no example files (R6)",
});

/** The codes check v0 had that the kit now reports, each with the kit's code that replaced it. */
export const RETIRED_CODES = Object.freeze({ C002: "B007", C003: "B008", C004: "B001" });

/**
 * A definition file that cannot be loaded at all (a syntax error, an exception, no define call), or an example
 * whose top level the checker's scan misread (it found a name declared twice, which a module cannot do).
 * rules.md gives this no number; an example that cannot be loaded is C001 instead.
 */
export const LOAD = "LOAD";

/**
 * One violation, as the checker prints it: `<file>:<line>: <code> <message>`, then `  fix: <fix>`.
 * @typedef {object} CheckDiagnostic
 * @property {string} file  Path relative to the candidate directory, with `/` separators.
 * @property {number} line  1-based.
 * @property {string} code  One of CHECK_CODES, LOAD, or the kit's own (D…, B…, L…, a Dialect's letter).
 * @property {"error" | "warning" | "info"} severity  As the kit gave it; the checker's own are errors.
 * @property {string} message
 * @property {string} fix  What to write instead.
 * @property {string} [tip]  The kit's advice, when it also gave a fix; printed on its own line after it.
 */

/** The checker's own codes in --effects mode (rules-effects.md), on top of CHECK_CODES. */
export const EFFECTS_CODES = Object.freeze({
  C008: "An example marked // REFUSED: <code> that checks clean: its Program builds and lowers with no error, or it has no Program to refuse (--effects)",
});

/**
 * In --effects mode, what an example marked // REFUSED: <code> failed with, beside the code it declared: an
 * info line, not a violation (the match is read by hand).
 */
export const REFUSED = "REFUSED";
