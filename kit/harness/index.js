// The comparison harness: a fields Program through the reference interpreter, the emitted JS and the emitted GLSL,
// compared pairwise. See README.md. GLSL runs in a page (page.html); `run.js` takes the way to run it as a function.

export { standardCases, stressCase, pixelUv } from "./cases.js";
export { prepare, uniformValues } from "./pipeline.js";
export { runCase, referencePixels, compareJs, compareGlsl, shaderJob } from "./run.js";
export { compare, rgbOf } from "./compare.js";
export { locate } from "./locate.js";
export { GLSL_TOLERANCE } from "./tolerance.js";
export { FAULTS } from "./faults.js";
export { runFaults, tally, FAULT_SCALE } from "./sensitivity.js";
export { renderJobs, describeRenderer, encodeFloats, decodeFloats } from "./gl.js";
