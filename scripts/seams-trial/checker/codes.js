// The seams trial's codes. D024–D031 stand in for the draft's "definition error (D-code) at defineDialect" for
// ports, frames and inputs (kit/define takes D001–D023; D016 is retired). S… is the draft's table for a
// composition, plus S102 and S257, which the stand-in adds (README, "Codes"). G… is the trial's task check,
// and C006 and LOAD are the checker's, as in the UI and package trials.

/** The Dialect additions' definition codes, thrown by the stand-in's defineDialect and defineGrammar. */
export const SEAM_DEFINE_CODES = Object.freeze({
  D024: "A malformed ports or inputs declaration: a key it does not take (with a did-you-mean), a required key missing (an output's seam or from, an input's seam, a note on a tagged or Event port), a port name that is not an identifier, a value of the wrong form",
  D025: "A seam type that does not parse, names a frame the Dialect does not declare, or tags a point or vector with a frame of other dims",
  D026: "An output's from that is neither a path nor a lambda, a path that names nothing in the run's state, a lambda that breaks the UI value lambda rules, or an Event output whose from is not a path to a state list",
  D027: "A local type that does not pair with its port's seam type: the state at an output's from, what an output's lambda gives (found when a Program lowers), or an input's member type (no vector type, or several, of a point's or vector's dims)",
  D028: "A value input with neither default nor required: true, or both, or a default that does not fit its seam type; an Event input with a default or required",
  D029: "Value inputs without inputs: { object, name }; an inputs object that is not a declared object or already has members; no global of inputs.name naming that object",
  D030: "A malformed frames or edges declaration: a key a frame does not take, dims other than 1, 2 or 3, a missing note, an extent or edges that is not a function; or (when a Program lowers) an extent(record) or edges(record) that throws or returns the wrong shape",
  D031: "A Grammar whose ref(\"in\") has no ports.in to name, that declares name(\"in\") itself, or with a slot or child construct named out, in or frame (the handles every builder gains)",
});

/** A composition's codes: the draft's table, then the stand-in's two additions. */
export const COMPOSE_CODES = Object.freeze({
  S101: "Two parts with one name",
  S102: "A composition call given the wrong thing: .part of something that is not a builder or twice, a handle of a part not passed to .part, .wire of anything but an output then an input, .frame of anything but two frames, .show of a part not in the composition or a second .show (added by the stand-in)",
  S111: "An output, input or frame the part does not have (lists what it has, with a did-you-mean)",
  S112: "An input wired twice",
  S113: "A required input with no wire",
  S114: "A part wired to itself",
  S201: "Seam kinds differ: an Event into a value input, a record into a scalar",
  S202: "A record field the consumer takes and the producer lacks, or one of another kind (names the field, both sides); a field the producer has and the consumer does not take is dropped on the wire, not an error",
  S203: "An enum the consumer does not accept",
  S204: "A list longer than the consumer's max",
  S251: "Tagged on both sides, no frame path",
  S252: "Tagged on one side only",
  S253: "Two frame paths disagree (names both, and the edges on each)",
  S254: "A quantity across a non-uniform scale",
  S255: "A point into a vector, or a vector into a point",
  S256: "\"fit\" with a frame that has no extent, with dims that differ, or whose extent(record) is not a box { min, max }",
  S257: "A malformed edge: not { scale, offset }, a scale of 0, the wrong number of axes; or two frames of different dims, or of one part, related by .frame (added by the stand-in)",
  S301: "A handle read as a value at build time (arithmetic, a condition)",
});

/** The trial's task checks, by role. */
export const TASK_CODES = Object.freeze({
  G101: "maze: no Event output (the pickup or goal stream the task asks for)",
  G102: "maze: the Event output's record has no tagged point (where it happened, in one of maze's frames)",
  G103: "maze or particles: a package file names the other package (each author knows nothing of the other)",
  G111: "particles: no Event input",
  G112: "particles: no Grammar option refers to an input with ref(\"in\") (the trigger)",
  G113: "particles: no value input is read in an example's lambda through the inputs object",
  G001: "compose: no wire from a maze Event output into a particles Event input that one of the part's emitters triggers on",
  G002: "compose: the wired maze output's name and note say nothing of a pickup or goal",
  G003: "compose: the wired event's position crosses without a frame path through a .frame of the glue (untagged, or no tagged point)",
  G004: "compose: the composition does not show the particles part, so the burst is not on the stage",
  G005: "compose: a package file differs from its manifest's hash (the composer edited a package)",
  G006: "compose: workbench.js does not export a default function of $ that returns a composition, or the composition has not exactly one maze part and one particles part",
});

/** The checker's own codes. */
export const CHECK_CODES = Object.freeze({
  C006: "workbench.js imports something other than \"kit/compose\", \"kit/define\", \"maze\" or \"particles\"",
});

/** A file that cannot be loaded at all: a syntax error, an exception at load. */
export const LOAD = "LOAD";

/**
 * One violation, printed as `<file>:<line>: <code> <message>`, the sides if any, then `  fix: <fix>`.
 * @typedef {object} Violation
 * @property {string} file  relative to the hand-in directory
 * @property {number} line  1-based
 * @property {string} code
 * @property {"error"} severity
 * @property {string} message
 * @property {string} fix
 * @property {Side} [from]
 * @property {Side} [to]
 */
/**
 * One side of a wire, an edge or a part: the part, its dialect and package version, the port or frame and its seam
 * type (or dims) when it has one, and, for a port or frame the part lacks, what it has.
 * @typedef {{ part: string, dialect: string, version: string, port?: string, frame?: string, seam?: string, dims?: number, has?: string[] }} Side
 */
