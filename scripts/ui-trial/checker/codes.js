// The UI trial checker's codes. U… is defineUI's own (kit/define's UI_CODES, re-exported here); C… and LOAD are the
// checker's, as in the Definition API trial.

export { UI_CODES } from "../../../kit/define/codes.js";

/** The checker's own codes. */
export const CHECK_CODES = Object.freeze({
  C001: "The UI file does not call defineUI exactly once",
  C006: "A file imports something other than \"kit/define\" or the package's own files",
});

/** The UI file (or a file it imports) cannot be loaded at all: a syntax error, an exception, a refused definition. */
export const LOAD = "LOAD";

/**
 * One violation, printed as `<file>:<line>: <code> <message>`, then `  fix: <fix>`.
 * @typedef {object} UIDiagnostic
 * @property {string} file  relative to the hand-in directory
 * @property {number} line  1-based
 * @property {string} code
 * @property {"error"} severity
 * @property {string} message
 * @property {string} fix
 */
