// Every code the composition trial's checker prints itself, with when it is reported (rules.md's tables).
// It also passes on kit/parse's own P… and S1… codes for a lambda outside the kernel subset.

export const CODES = Object.freeze({
  C001: "program.js is missing, or does not export default a program(…) with a .show()",
  C002: "a part that is not bound to a top-level const",
  C003: "program.js or a lib/ file cannot be loaded, or imports from elsewhere",
  C004: "an undeclared or malformed parameter",
  C005: "program.js or a lib/ file ended the checker (process.exit, a top-level wait that never ends), never finished, or raised an unhandled rejection",
  D001: "a method the part, actor or program does not have",
  D002: "an argument of the wrong type, out of range, or missing",
  D003: "a required method not called",
  D004: "a once-only method called twice, or a kind or name declared twice",
  D005: "an unknown member of a lambda's context",
  D006: "a player actor not spawned exactly once, or an actor kind no part uses",
  D007: "a construct the GPU does not have, in a GPU lambda",
  S201: "a Grid connected to a slot of a different shape",
  S202: "a value mapping that misses a grid value or names an unknown tile",
  S203: "an output of the wrong seam type for its slot or target",
  S204: "a spawn kind the producing part does not declare",
  S251: "a tagged value passed unchanged where another frame is expected",
  S301: "another part's output read at build time",
  S302: "an output passed to a slot that is fixed at build",
  S311: "an output the part does not have",
  S312: "a reach into another part's internals",
  S313: "a part reading its own output",
  S321: "a bad .sample()",
  S331: "a free name a lambda cannot see",
  S332: "a dialect's function used in another dialect's lambda",
  G001: "no cave → tiles value seam with a tile() conversion",
  G002: "no tiles → glow per-frame signal",
  G003: "no cross-part cycle through a signal-dependent cave seed",
  G004: "no lib/ helper used on both CPU and GPU",
  G005: "no parameter read both at build time and in a kernel",
});

/**
 * One violation, as the checker prints it: `<file>:<line>: <code> <message>`, then `  fix: <fix>`.
 * @typedef {object} CheckDiagnostic
 * @property {string} file  Path relative to the candidate directory, with `/` separators.
 * @property {number} line  1-based.
 * @property {string} code  One of CODES, or kit/parse's P… / S1….
 * @property {"error" | "warning"} severity
 * @property {string} message
 * @property {string} fix
 */
