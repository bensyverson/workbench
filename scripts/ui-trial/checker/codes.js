// The UI trial checker's codes. U… is the draft UI API's own (docs/ui-draft.md, "Codes"); C… and LOAD are the
// checker's, as in the Definition API trial.

/** Each U code and when it is reported; the tests check each has a failing hand-in and is documented. */
export const UI_CODES = Object.freeze({
  U001: "An unknown key (with a did-you-mean), or a required key missing",
  U002: "A component kind that does not exist",
  U003: "A place or annotate that names no view or tile, or tiles placed in a cycle",
  U004: "A place without exactly one direction, or a bad size",
  U005: "A path that names nothing in state, or names the wrong type for its key",
  U006: "A state shape that is not a shape, or an empty state",
  U007: "A lambda that does not parse, leaves the subset, takes too many parameters, assigns anything but its own let locals, reads an undeclared state member or a free name the Dialect does not give",
  U008: "A custom element without the package prefix or a valid tag, without a module, with a module that is not a package file or does not define the tag, or a tag used twice",
  U009: "An emits event that is not pick, select or param, or emits without an element",
  U010: "Inputs whose object is not a Dialect object, whose buttons are not exactly its bool members, or with an unknown or repeated role",
  U011: "A tile id that is not an identifier or is a generated view's id",
  U012: "A value of the wrong form: a non-string label, title or note, a number out of range or not whole, a bad columns entry, an empty body or items",
  U013: "defineUI given something other than the package's Grammar builder, or a Dialect without text(state)",
});

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
