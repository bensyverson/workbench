// kit/page: a composed run mounted on a canvas, for a host page to build on. README.md is the API; no Node
// built-ins and no DOM: the host passes the context, the frame source, the image decoder and the key events.

export { createPage } from "./page.js";
export { examplePreset } from "./preset.js";
export { sweepRuns } from "./sweep.js";
export { runTests } from "./tests.js";
export { DEFAULT_KEYS, KEY_TARGETS } from "./keys.js";
export { PAGE_CODES, MAX_PAGE_DIAGNOSTICS } from "./codes.js";
