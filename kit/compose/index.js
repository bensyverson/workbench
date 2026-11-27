// kit/compose: the glue program. compose(name) wires parts, each a Program built by its own package's Grammar,
// relates their frames, and checks every wire and edge, naming both sides. The composed record holds each wire's
// conversion plan as data, for the scheduler. README.md is the spec; no Node built-ins, so it runs in the page too.

export { compose, ComposeError, isComposition } from "./compose.js";
export { COMPOSE_CODES } from "./codes.js";
export { formatDiagnostic } from "./format.js";
export { scanGlue, GLUE_SPECIFIERS } from "./glue.js";
export { rewriteGlue, callGlue } from "./glue-load.js";
export { layer } from "./layer.js";
export { replan, planOf } from "./replan.js";
export { ANCHORS } from "./edges.js";
export { page, PAGE, PAGE_CONTROLS, PAGE_CHANGES_PER_FRAME, pageRuntime, pageInputProblem } from "./page.js";
export { queueProblems, stepsIn, catchUpOf, CATCH_UP, NOMINAL_FRAME, MIN_FRAME } from "./queues.js";
